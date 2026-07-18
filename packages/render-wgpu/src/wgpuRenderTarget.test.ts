import { createMatrix } from '@flighthq/geometry';

import { renderWgpuBackground, submitWgpuRenderPass } from './wgpuBackground';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';
import {
  beginWgpuRenderPass,
  createWgpuRenderTarget,
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
  it('returns a target with texture, view, bind group, and depth-stencil', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 256, 256);
    expect(target.texture).toBeDefined();
    expect(target.view).toBeDefined();
    expect(target.bindGroup).toBeDefined();
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

describe('resizeWgpuRenderTarget', () => {
  it('updates width, height, and bind group', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuRenderTarget(state, 64, 64);
    const previousBindGroup = target.bindGroup;
    resizeWgpuRenderTarget(state, target, 200, 150);
    expect(target.width).toBe(200);
    expect(target.height).toBe(150);
    expect(target.bindGroup).toBeDefined();
    expect(target.bindGroup).not.toBe(previousBindGroup);
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
