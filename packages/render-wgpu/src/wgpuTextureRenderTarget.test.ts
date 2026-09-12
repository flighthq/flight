import { createMatrix } from '@flighthq/geometry/contract';

import { resolveWgpuSmoothingBindGroup } from './wgpuDraw';
import { submitWgpuFrame } from './wgpuFrame';
import { getWgpuRenderStateDeviceResources } from './wgpuRenderState';
import { beginWgpuScreenRenderPassForTest, createWgpuRenderStateForTest, installWgpuMock } from './wgpuTestHelper';
import {
  createWgpuTextureRenderTarget,
  destroyWgpuTextureRenderTarget,
  drawWgpuTextureRenderTargetResult,
  initializeWgpuTextureRenderTarget,
  resizeWgpuTextureRenderTarget,
} from './wgpuTextureRenderTarget';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuTextureRenderTarget', () => {
  it('returns a target with texture, view, binding cache, and depth-stencil', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 256, 256);
    expect(target.texture).toBeDefined();
    expect(target.view).toBeDefined();
    expect(target.bindings).toBeDefined();
    expect(target.depthStencilTexture).toBeDefined();
    expect(target.width).toBe(256);
    expect(target.height).toBe(256);
  });

  it('clamps to minimum 1×1', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 0, 0);
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });

  it('defaults to sRGB and accepts a linear content declaration', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(createWgpuTextureRenderTarget(state, 16, 16).colorSpace).toBe('srgb');
    expect(createWgpuTextureRenderTarget(state, 16, 16, state.format, 'linear').colorSpace).toBe('linear');
  });

  it('realizes four coverage samples as a 2x extent in each axis', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 64, 48, state.format, 'srgb', 4);
    expect(target.width).toBe(128);
    expect(target.height).toBe(96);
    expect(target.sampleCount).toBe(4);
    expect(target.texture.width).toBe(128);
    expect(target.texture.height).toBe(96);
  });
});

describe('destroyWgpuTextureRenderTarget', () => {
  it('calls destroy on texture and depth-stencil', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 64, 64);
    const destroyTexture = vi.spyOn(target.texture, 'destroy');
    const destroyDepth = vi.spyOn(target.depthStencilTexture, 'destroy');
    destroyWgpuTextureRenderTarget(state, target);
    expect(destroyTexture).toHaveBeenCalled();
    expect(destroyDepth).toHaveBeenCalled();
  });
});

describe('drawWgpuTextureRenderTargetResult', () => {
  it('does not throw with an open render pass', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const target = createWgpuTextureRenderTarget(state, 64, 64);
    const fakeNode = {
      alpha: 1,
      material: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    expect(() => drawWgpuTextureRenderTargetResult(state, fakeNode, target, createMatrix())).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('initializeWgpuTextureRenderTarget', () => {
  it('is the construction initializer of createWgpuTextureRenderTarget', () => {
    expect(typeof initializeWgpuTextureRenderTarget).toBe('function');
  });
});

describe('resizeWgpuTextureRenderTarget', () => {
  it('preserves the allocation when dimensions are unchanged', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 64, 64);
    const texture = target.texture;
    const depthStencilTexture = target.depthStencilTexture;
    const sampler = getWgpuRenderStateDeviceResources(state).linearSampler;
    const bindGroup = resolveWgpuSmoothingBindGroup(state, target, true);

    resizeWgpuTextureRenderTarget(state, target, 64, 64);

    expect(target.texture).toBe(texture);
    expect(target.depthStencilTexture).toBe(depthStencilTexture);
    // The view survived, so its cached bindings must survive with it.
    expect(target.bindings.get(sampler)).toBe(bindGroup);
  });

  it('updates width, height, and drops bindings that referenced the old view', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 64, 64);
    const previousBindGroup = resolveWgpuSmoothingBindGroup(state, target, true);
    resizeWgpuTextureRenderTarget(state, target, 200, 150);
    expect(target.width).toBe(200);
    expect(target.height).toBe(150);
    // Reallocation replaces the view, so every binding over the old one is dropped and rebuilt.
    expect(target.bindings.size).toBe(0);
    expect(resolveWgpuSmoothingBindGroup(state, target, true)).not.toBe(previousBindGroup);
  });

  it('reallocates when the effective sample count changes', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuTextureRenderTarget(state, 64, 48);
    const previousTexture = target.texture;

    resizeWgpuTextureRenderTarget(state, target, 64, 48, 4);

    expect(target.width).toBe(128);
    expect(target.height).toBe(96);
    expect(target.sampleCount).toBe(4);
    expect(target.texture).not.toBe(previousTexture);
  });
});
