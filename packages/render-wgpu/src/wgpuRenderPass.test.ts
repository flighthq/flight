import { createMatrix } from '@flighthq/geometry/contract';

import { beginWgpuFrame, submitWgpuFrame } from './wgpuFrame';
import {
  beginWgpuRenderPass,
  endWgpuRenderPass,
  getWgpuActiveRenderPass,
  getWgpuRenderPassViewport,
  resumeWgpuRenderPass,
  setWgpuRenderTransform2D,
  suspendWgpuRenderPass,
} from './wgpuRenderPass';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  beginWgpuScreenRenderPassForTest,
  createWgpuRenderStateForTest,
  createWgpuScreenRenderTargetForTest,
  installWgpuMock,
} from './wgpuTestHelper';
import { createWgpuTextureRenderTarget } from './wgpuTextureRenderTarget';

beforeAll(() => {
  installWgpuMock();
});

describe('beginWgpuRenderPass', () => {
  it('reports the target extent as the pass viewport', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const pass = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 64, 64));

    expect(pass.viewport.width).toBe(64);
    expect(getWgpuRenderStateRuntime(state).renderTargetViewport?.width).toBe(64);

    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });

  // The viewport is LOGICAL, not the storage extent. A supersampled target is allocated at 2x per axis,
  // and a projection that divided by that physical width would map logical x = 800 to NDC 0 — the scene
  // filling a quarter of its own target, which is exactly the defect the derived scale exists to prevent.
  it('reports the logical extent for a supersampled target, not its physical storage', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const target = createWgpuTextureRenderTarget(state, 400, 300, state.format, 'srgb', 4);
    const pass = beginWgpuRenderPass(state, target);

    expect(target.width).toBe(800);
    expect(pass.viewport).toEqual({ height: 300, width: 400 });

    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });

  it('passes float RGBA clear values through to the GPU color attachment', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const beginRenderPass = vi.spyOn(getWgpuRenderStateRuntime(state).commandEncoder!, 'beginRenderPass');
    const target = createWgpuTextureRenderTarget(state, 32, 32, state.format, 'linear');

    const pass = beginWgpuRenderPass(state, target, { color: [0.25, 0.5, 0.75, 1.0] });

    const attachment = Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!;
    const clearValue = attachment.clearValue as GPUColorDict;
    expect([clearValue.r, clearValue.g, clearValue.b, clearValue.a]).toEqual([0.25, 0.5, 0.75, 1.0]);
    expect(attachment.loadOp).toBe('clear');

    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });

  it('preserves the target when no clear is given', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const beginRenderPass = vi.spyOn(getWgpuRenderStateRuntime(state).commandEncoder!, 'beginRenderPass');

    const pass = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 32, 32));

    const attachment = Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!;
    expect(attachment.loadOp).toBe('load');

    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });

  it('opens the frame when none is open, and leaves an explicitly opened frame to its owner', async () => {
    const state = await createWgpuRenderStateForTest();
    const owning = beginWgpuScreenRenderPassForTest(state);
    expect(owning.ownsFrame).toBe(true);
    endWgpuRenderPass(owning);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();

    beginWgpuFrame(state);
    const borrowed = beginWgpuScreenRenderPassForTest(state);
    expect(borrowed.ownsFrame).toBe(false);
    endWgpuRenderPass(borrowed);
    // The frame outlives the pass, which is what lets a shadow pass and a screen pass share one submit.
    expect(getWgpuRenderStateRuntime(state).commandEncoder).not.toBeNull();
    submitWgpuFrame(state);
  });
});

describe('endWgpuRenderPass', () => {
  it('restores the enclosing target, viewport, and clip state', async () => {
    const state = await createWgpuRenderStateForTest();
    const screen = createWgpuScreenRenderTargetForTest(state);
    const outer = beginWgpuRenderPass(state, screen, { color: [0, 0, 0, 0] });
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentScissorRect = { height: 10, width: 10, x: 0, y: 0 };

    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 32, 32));
    expect(runtime.currentScissorRect).toBeNull();
    endWgpuRenderPass(inner);

    expect(runtime.currentRenderTarget).toBe(screen);
    expect(runtime.renderTargetViewport).toEqual({ height: 600, width: 800 });
    expect(runtime.currentScissorRect).toEqual({ height: 10, width: 10, x: 0, y: 0 });

    endWgpuRenderPass(outer);
    expect(runtime.currentRenderTarget).toBeNull();
    expect(runtime.renderTargetViewport).toBeNull();
  });

  it('resumes the enclosing pass with a fresh encoder that preserves its pixels', async () => {
    // A WebGPU pass encoder cannot be reopened, so the enclosing pass is re-recorded — and it must load
    // rather than clear, or every nested offscreen pass would wipe the frame that surrounds it.
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const suspendedEncoder = outer.encoder;

    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 32, 32));
    expect(outer.encoder).toBeNull();
    const beginRenderPass = vi.spyOn(runtime.commandEncoder!, 'beginRenderPass');
    endWgpuRenderPass(inner);

    expect(outer.encoder).not.toBeNull();
    expect(outer.encoder).not.toBe(suspendedEncoder);
    expect(runtime.renderPass).toBe(outer.encoder);
    expect(Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!.loadOp).toBe('load');

    endWgpuRenderPass(outer);
  });

  it('submits the frame it opened, and only that frame', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 16, 16));

    endWgpuRenderPass(inner);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).not.toBeNull();

    endWgpuRenderPass(outer);
    expect(getWgpuRenderStateRuntime(state).commandEncoder).toBeNull();
  });

  it('refuses a pass that is not the innermost open one', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 16, 16));

    expect(() => endWgpuRenderPass(outer)).toThrow(/innermost open pass/);

    endWgpuRenderPass(inner);
    endWgpuRenderPass(outer);
  });
});

describe('getWgpuActiveRenderPass', () => {
  it('names the innermost open pass and nothing outside a bracket', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuActiveRenderPass(state)).toBeNull();

    const outer = beginWgpuScreenRenderPassForTest(state);
    expect(getWgpuActiveRenderPass(state)).toBe(outer);
    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 16, 16));
    expect(getWgpuActiveRenderPass(state)).toBe(inner);

    endWgpuRenderPass(inner);
    expect(getWgpuActiveRenderPass(state)).toBe(outer);
    endWgpuRenderPass(outer);
    expect(getWgpuActiveRenderPass(state)).toBeNull();
  });
});

describe('getWgpuRenderPassViewport', () => {
  it('throws outside a pass rather than inventing a canvas-sized default', async () => {
    // A draw with no target bound is API misuse; a default extent would hide it until the picture came
    // out the wrong size, with nothing in the failure naming the missing begin.
    const state = await createWgpuRenderStateForTest();
    expect(() => getWgpuRenderPassViewport(state)).toThrow(/beginWgpuRenderPass/);
  });

  it('reports the innermost pass extent', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    expect(getWgpuRenderPassViewport(state)).toEqual({ height: 600, width: 800 });

    const inner = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 40, 20));
    expect(getWgpuRenderPassViewport(state)).toEqual({ height: 20, width: 40 });

    endWgpuRenderPass(inner);
    endWgpuRenderPass(outer);
  });
});

describe('resumeWgpuRenderPass', () => {
  it('reopens a suspended pass over the same target', async () => {
    const state = await createWgpuRenderStateForTest();
    const pass = beginWgpuScreenRenderPassForTest(state);
    const target = pass.target;
    suspendWgpuRenderPass(pass);

    resumeWgpuRenderPass(pass);

    expect(pass.encoder).not.toBeNull();
    expect(pass.target).toBe(target);
    expect(getWgpuRenderStateRuntime(state).renderPass).toBe(pass.encoder);
    endWgpuRenderPass(pass);
  });
});

describe('setWgpuRenderTransform2D', () => {
  it('installs a copy of the transform, restored by the enclosing pass', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const original = state.renderTransform2D;
    const bake = createMatrix();
    bake.tx = 42;

    const pass = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 32, 32));
    setWgpuRenderTransform2D(pass, bake);
    expect(state.renderTransform2D?.tx).toBe(42);
    expect(state.renderTransform2D).not.toBe(bake);
    endWgpuRenderPass(pass);

    expect(state.renderTransform2D).toBe(original);
    endWgpuRenderPass(outer);
  });
});

describe('suspendWgpuRenderPass', () => {
  it('closes the encoder while leaving the pass open', async () => {
    // The effect pipeline records its own fullscreen passes into the frame, which it can only do while
    // no other pass encoder is recording.
    const state = await createWgpuRenderStateForTest();
    const pass = beginWgpuScreenRenderPassForTest(state);

    suspendWgpuRenderPass(pass);

    expect(pass.encoder).toBeNull();
    expect(getWgpuRenderStateRuntime(state).renderPass).toBeNull();
    expect(getWgpuActiveRenderPass(state)).toBe(pass);

    resumeWgpuRenderPass(pass);
    endWgpuRenderPass(pass);
  });
});
