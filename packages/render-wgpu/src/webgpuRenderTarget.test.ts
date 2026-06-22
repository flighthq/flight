import { createMatrix } from '@flighthq/geometry';

import { renderWgpuBackground, submitWgpuRenderPass } from './webgpuBackground';
import { getWgpuRenderStateRuntime } from './webgpuRenderState';
import {
  beginWgpuRenderTarget,
  createWgpuRenderTarget,
  destroyWgpuRenderTarget,
  drawWgpuRenderTargetResult,
  endWgpuRenderTarget,
  resizeWgpuRenderTarget,
} from './webgpuRenderTarget';
import { createWgpuRenderStateForTest, installWgpuMock } from './webgpuTestHelper';

beforeAll(() => {
  installWgpuMock();
});

describe('beginWgpuRenderTarget', () => {
  it('sets the render target viewport', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const target = createWgpuRenderTarget(state, 64, 64);
    beginWgpuRenderTarget(state, target, createMatrix());
    expect(getWgpuRenderStateRuntime(state).renderTargetViewport?.width).toBe(64);
    endWgpuRenderTarget(state);
    submitWgpuRenderPass(state);
  });
});

describe('beginWgpuRenderTarget / endWgpuRenderTarget', () => {
  it('switches the render target and restores it', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const target = createWgpuRenderTarget(state, 128, 128);
    const transform = createMatrix();
    beginWgpuRenderTarget(state, target, transform);

    const runtime = getWgpuRenderStateRuntime(state);
    expect(runtime.renderTargetViewport?.width).toBe(128);

    endWgpuRenderTarget(state);
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

describe('endWgpuRenderTarget', () => {
  it('restores null renderTargetViewport', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const target = createWgpuRenderTarget(state, 32, 32);
    beginWgpuRenderTarget(state, target, createMatrix());
    endWgpuRenderTarget(state);
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
