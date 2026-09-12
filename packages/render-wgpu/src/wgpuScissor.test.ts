import { beginWgpuRenderPass, endWgpuRenderPass } from './wgpuRenderPass';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  applyWgpuScissorRect,
  popWgpuScissorRect,
  pushWgpuScissorRect,
  setWgpuRenderPassScissorRect,
} from './wgpuScissor';
import { beginWgpuScreenRenderPassForTest, createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import { createWgpuTextureRenderTarget } from './wgpuTextureRenderTarget';

beforeAll(() => {
  installWgpuMock();
});

describe('applyWgpuScissorRect', () => {
  it('calls setScissorRect on the pass when a rect is active', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentScissorRect = { x: 10, y: 20, width: 100, height: 50 };
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual([10, 20, 100, 50]);
  });

  it('is a no-op when currentScissorRect is null', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls.length).toBe(0);
  });

  it('clamps dimensions to at least 1×1', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    runtime.currentScissorRect = { x: 0, y: 0, width: 0, height: 0 };
    const calls: number[][] = [];
    const fakePass = { setScissorRect: (...args: number[]) => calls.push(args) } as unknown as GPURenderPassEncoder;
    applyWgpuScissorRect(state, fakePass);
    expect(calls[0]).toEqual([0, 0, 1, 1]);
  });
});

describe('popWgpuScissorRect', () => {
  it('is a no-op when the stack is empty', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    expect(() => popWgpuScissorRect(state)).not.toThrow();
    expect(getWgpuRenderStateRuntime(state).currentScissorRect).toBeNull();
  });

  it('restores the previous rect after a push/pop pair', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const r1 = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 10, y: 10, width: 50, height: 50 };
    pushWgpuScissorRect(state, r1);
    pushWgpuScissorRect(state, r2);
    popWgpuScissorRect(state);
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.currentScissorRect).toEqual(r1);
    popWgpuScissorRect(state);
    expect(runtime.currentScissorRect).toBeNull();
  });
});

describe('pushWgpuScissorRect', () => {
  it('sets currentScissorRect on first push', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const rect = { x: 5, y: 10, width: 80, height: 40 };
    pushWgpuScissorRect(state, rect);
    expect(getWgpuRenderStateRuntime(state).currentScissorRect).toEqual(rect);
  });

  it('stacks previous rect when pushing a second rect', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const r1 = { x: 0, y: 0, width: 100, height: 100 };
    const r2 = { x: 20, y: 20, width: 60, height: 60 };
    pushWgpuScissorRect(state, r1);
    pushWgpuScissorRect(state, r2);
    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.currentScissorRect).toEqual(r2);
    expect(runtime.scissorStack.length).toBe(1);
    expect(runtime.scissorStack[0]).toEqual(r1);
  });

  it('copies the rect so mutation of the original does not affect the pushed value', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    pushWgpuScissorRect(state, rect);
    rect.width = 999;
    expect(getWgpuRenderStateRuntime(state).currentScissorRect?.width).toBe(50);
  });
});

describe('setWgpuRenderPassScissorRect', () => {
  it('scales logical coordinates onto a supersampled screen surface', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state, { color: [0, 0, 0, 0] }, { antialias: true });
    const setScissorRect = vi.fn();

    setWgpuRenderPassScissorRect(state, { setScissorRect } as unknown as GPURenderPassEncoder, 3, 5, 7, 11);

    expect(setScissorRect).toHaveBeenCalledWith(6, 10, 14, 22);
  });

  // Logical is one coordinate space, so a supersampled OFFSCREEN target scales its scissors by the same
  // factor its storage was grown by. It previously passed them through unscaled while the screen scaled
  // them, which left a clip inside a sampleCount-4 effect target covering a quarter of its intended area.
  it('scales them onto a supersampled texture target by the same rule', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const pass = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 64, 64, state.format, 'srgb', 4));
    const setScissorRect = vi.fn();

    setWgpuRenderPassScissorRect(state, { setScissorRect } as unknown as GPURenderPassEncoder, 3, 5, 7, 11);

    expect(setScissorRect).toHaveBeenCalledWith(6, 10, 14, 22);
    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });

  it('passes them through unscaled on a target with no supersample', async () => {
    const state = await createWgpuRenderStateForTest();
    const outer = beginWgpuScreenRenderPassForTest(state);
    const pass = beginWgpuRenderPass(state, createWgpuTextureRenderTarget(state, 64, 64));
    const setScissorRect = vi.fn();

    setWgpuRenderPassScissorRect(state, { setScissorRect } as unknown as GPURenderPassEncoder, 3, 5, 7, 11);

    expect(setScissorRect).toHaveBeenCalledWith(3, 5, 7, 11);
    endWgpuRenderPass(pass);
    endWgpuRenderPass(outer);
  });
});
