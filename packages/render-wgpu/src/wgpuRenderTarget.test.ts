import { createMatrix } from '@flighthq/geometry/contract';
import type { WgpuRenderTarget } from '@flighthq/types/contract';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { resolveWgpuSmoothingBindGroup } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  getWgpuRenderTargetSupersampleScale,
  beginWgpuRenderPass,
  createWgpuRenderTarget,
  declareWgpuRenderTargetColorSpace,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderPass,
  resizeWgpuRenderTarget,
  setWgpuRenderTransform2D,
} from './wgpuRenderTarget';
import { createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('beginWgpuRenderPass', () => {
  it('sets the render target viewport', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const target = createWgpuRenderTarget(state, 64, 64);
    beginWgpuRenderPass(state, target);
    expect(getWgpuRenderStateRuntime(state).renderTargetViewport?.width).toBe(64);
    endWgpuRenderPass(state);
    submitWgpuRenderPass(state);
  });

  it('switches the render target and restores it on end', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const target = createWgpuRenderTarget(state, 128, 128);
    beginWgpuRenderPass(state, target);

    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderTargetViewport?.width).toBe(128);

    endWgpuRenderPass(state);
    expect(runtime.renderTargetViewport).toBeNull();

    submitWgpuRenderPass(state);
  });
});

describe('createWgpuRenderTarget', () => {
  it('returns a target with texture, view, binding cache, and depth-stencil', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 256, 256);
    expect(target.texture).toBeDefined();
    expect(target.view).toBeDefined();
    expect(target.bindings).toBeDefined();
    expect(target.depthStencilTexture).toBeDefined();
    expect(target.width).toBe(256);
    expect(target.height).toBe(256);
  });

  it('clamps to minimum 1×1', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 0, 0);
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('defaults to sRGB and accepts a linear content declaration', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(createWgpuRenderTarget(state, 16, 16).colorSpace).toBe('srgb');
    expect(createWgpuRenderTarget(state, 16, 16, state.format, 'linear').colorSpace).toBe('linear');
  });

  it('realizes four coverage samples as a 2x extent in each axis', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 48, state.format, 'srgb', 4);
    expect(target.width).toBe(128);
    expect(target.height).toBe(96);
    expect(target.sampleCount).toBe(4);
    expect(target.texture.width).toBe(128);
    expect(target.texture.height).toBe(96);
  });
});

describe('declareWgpuRenderTargetColorSpace', () => {
  it('decodes a nonblack packed sRGB clear when the target is created as linear', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const beginRenderPass = vi.spyOn(runtime.commandEncoder!, 'beginRenderPass');
    const target = createWgpuRenderTarget(state, 32, 32, state.format, 'linear');
    target.clearColors = [0x0a0c10ff];

    beginWgpuRenderPass(state, target);
    const attachment = Array.from(beginRenderPass.mock.calls.at(-1)![0].colorAttachments)[0]!;
    const linearClear = attachment.clearValue as GPUColorDict;
    expect(beginRenderPass).toHaveBeenCalledTimes(1);
    expect(linearClear.r).toBeCloseTo(0.00303527);
    expect(linearClear.g).toBeCloseTo(0.00367651);
    expect(linearClear.b).toBeCloseTo(0.00518152);
    expect(linearClear.a).toBe(1);

    endWgpuRenderPass(state);
    submitWgpuRenderPass(state);
  });

  it('stamps the current target and restores the enclosing target on end', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const outer = createWgpuRenderTarget(state, 32, 32);
    const inner = createWgpuRenderTarget(state, 16, 16);

    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(false);
    beginWgpuRenderPass(state, outer);
    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(true);
    beginWgpuRenderPass(state, inner);
    expect(declareWgpuRenderTargetColorSpace(state, 'linear')).toBe(true);
    endWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).currentRenderTarget).toBe(outer);
    endWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).currentRenderTarget).toBeNull();
    expect(outer.colorSpace).toBe('linear');
    expect(inner.colorSpace).toBe('linear');
    submitWgpuRenderPass(state);
  });
});

describe('destroyWgpuRenderTarget', () => {
  it('calls destroy on texture and depth-stencil', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 64);
    const destroyTexture = vi.spyOn(target.texture, 'destroy');
    const destroyDepth = vi.spyOn(target.depthStencilTexture, 'destroy');
    destroyWgpuRenderTarget(state, target);
    expect(destroyTexture).toHaveBeenCalled();
    expect(destroyDepth).toHaveBeenCalled();
  });
});

describe('drawWgpuRenderTargetResult', () => {
  it('does not throw with an open render pass', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const target = createWgpuRenderTarget(state, 64, 64);
    const fakeNode = {
      alpha: 1,
      material: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    expect(() => drawWgpuRenderTargetResult(state, fakeNode, target, createMatrix())).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('endWgpuRenderPass', () => {
  it('restores null renderTargetViewport', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const target = createWgpuRenderTarget(state, 32, 32);
    beginWgpuRenderPass(state, target);
    endWgpuRenderPass(state);
    expect(getWgpuRenderStateRuntime(state).renderTargetViewport).toBeNull();
    submitWgpuRenderPass(state);
  });
});

describe('getWgpuRenderTargetSupersampleScale', () => {
  // ★ THE ALLOCATOR AND THE PROJECTION HAVE TO AGREE. A sampleCount-4 target is allocated at 2x per axis;
  // if the 2D projection divides by that physical width it maps logical x = 800 to NDC 0, and the scene
  // fills a quarter of its own target. Measured on effect-sepia before the repair: the WebGPU frame
  // equalled the WebGL frame sampled at (2x, 2y) on 12 of 12 grid points; after, 48 of 48 matched 1:1.
  it('reports 2 for a supersampled target and 1 for a single-sample one', () => {
    expect(getWgpuRenderTargetSupersampleScale({ sampleCount: 4 } as WgpuRenderTarget)).toBe(2);
    expect(getWgpuRenderTargetSupersampleScale({ sampleCount: 1 } as WgpuRenderTarget)).toBe(1);
  });

  // Dividing the physical extent by the scale has to land back on the logical extent exactly, or the
  // projection drifts by a pixel at odd sizes. The allocator ceils BEFORE scaling, which is what makes
  // this exact rather than approximately right.
  it('inverts the allocator exactly, including at an odd logical size', () => {
    for (const [logical, sampleCount] of [
      [801, 4],
      [599, 4],
      [800, 1],
      [1, 4],
    ] as const) {
      const physical = Math.max(1, Math.ceil(logical)) * (sampleCount === 4 ? 2 : 1);
      const scale = getWgpuRenderTargetSupersampleScale({ sampleCount } as WgpuRenderTarget);

      expect(physical / scale).toBe(logical);
    }
  });
});

describe('resizeWgpuRenderTarget', () => {
  it('preserves the allocation when dimensions are unchanged', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 64);
    const texture = target.texture;
    const depthStencilTexture = target.depthStencilTexture;
    const sampler = getWgpuRenderStateRuntime(state).context.linearSampler;
    const bindGroup = resolveWgpuSmoothingBindGroup(state, target, true);

    resizeWgpuRenderTarget(state, target, 64, 64);

    expect(target.texture).toBe(texture);
    expect(target.depthStencilTexture).toBe(depthStencilTexture);
    // The view survived, so its cached bindings must survive with it.
    expect(target.bindings.get(sampler)).toBe(bindGroup);
  });

  it('updates width, height, and drops bindings that referenced the old view', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 64);
    const previousBindGroup = resolveWgpuSmoothingBindGroup(state, target, true);
    resizeWgpuRenderTarget(state, target, 200, 150);
    expect(target.width).toBe(200);
    expect(target.height).toBe(150);
    // Reallocation replaces the view, so every binding over the old one is dropped and rebuilt.
    expect(target.bindings.size).toBe(0);
    expect(resolveWgpuSmoothingBindGroup(state, target, true)).not.toBe(previousBindGroup);
  });

  it('reallocates when the effective sample count changes', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 48);
    const previousTexture = target.texture;

    resizeWgpuRenderTarget(state, target, 64, 48, 4);

    expect(target.width).toBe(128);
    expect(target.height).toBe(96);
    expect(target.sampleCount).toBe(4);
    expect(target.texture).not.toBe(previousTexture);
  });
});

describe('setWgpuRenderTransform2D', () => {
  it('installs a copy of the transform, restored by the enclosing pass', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const original = state.renderTransform2D;
    const target = createWgpuRenderTarget(state, 32, 32);
    const bake = createMatrix();
    bake.tx = 42;

    beginWgpuRenderPass(state, target);
    setWgpuRenderTransform2D(state, bake);
    expect(state.renderTransform2D?.tx).toBe(42);
    expect(state.renderTransform2D).not.toBe(bake);
    endWgpuRenderPass(state);

    expect(state.renderTransform2D).toBe(original);
    submitWgpuRenderPass(state);
  });
});
