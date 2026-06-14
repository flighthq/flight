import { createMatrix } from '@flighthq/geometry';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  beginWebGPURenderTarget,
  createWebGPURenderTarget,
  destroyWebGPURenderTarget,
  drawWebGPURenderTargetResult,
  endWebGPURenderTarget,
  resizeWebGPURenderTarget,
} from './webgpuRenderTarget';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('beginWebGPURenderTarget', () => {
  it('sets the render target viewport', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const target = createWebGPURenderTarget(state, 64, 64);
    beginWebGPURenderTarget(state, target, createMatrix());
    expect((state as never as { renderTargetViewport: { width: number } }).renderTargetViewport?.width).toBe(64);
    endWebGPURenderTarget(state);
    submitWebGPURenderPass(state);
  });
});

describe('beginWebGPURenderTarget / endWebGPURenderTarget', () => {
  it('switches the render target and restores it', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const target = createWebGPURenderTarget(state, 128, 128);
    const transform = createMatrix();
    beginWebGPURenderTarget(state, target, transform);

    const internal = state as never as { renderTargetViewport: { width: number; height: number } | null };
    expect(internal.renderTargetViewport?.width).toBe(128);

    endWebGPURenderTarget(state);
    expect(internal.renderTargetViewport).toBeNull();

    submitWebGPURenderPass(state);
  });
});

describe('createWebGPURenderTarget', () => {
  it('returns a target with texture, view, and depth-stencil', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPURenderTarget(state, 256, 256);
    expect(target.texture).toBeDefined();
    expect(target.view).toBeDefined();
    expect(target.depthStencilTexture).toBeDefined();
    expect(target.width).toBe(256);
    expect(target.height).toBe(256);
  });

  it('clamps to minimum 1×1', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPURenderTarget(state, 0, 0);
    expect(target.width).toBe(1);
    expect(target.height).toBe(1);
  });
});

describe('destroyWebGPURenderTarget', () => {
  it('calls destroy on texture and depth-stencil', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPURenderTarget(state, 64, 64);
    const destroyTexture = vi.spyOn(target.texture, 'destroy');
    const destroyDepth = vi.spyOn(target.depthStencilTexture, 'destroy');
    destroyWebGPURenderTarget(state, target);
    expect(destroyTexture).toHaveBeenCalled();
    expect(destroyDepth).toHaveBeenCalled();
  });
});

describe('drawWebGPURenderTargetResult', () => {
  it('does not throw with an open render pass', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const target = createWebGPURenderTarget(state, 64, 64);
    const fakeNode = {
      alpha: 1,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    };
    expect(() => drawWebGPURenderTargetResult(state, fakeNode, target, createMatrix())).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('endWebGPURenderTarget', () => {
  it('restores null renderTargetViewport', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const target = createWebGPURenderTarget(state, 32, 32);
    beginWebGPURenderTarget(state, target, createMatrix());
    endWebGPURenderTarget(state);
    expect((state as never as { renderTargetViewport: null }).renderTargetViewport).toBeNull();
    submitWebGPURenderPass(state);
  });
});

describe('resizeWebGPURenderTarget', () => {
  it('updates width and height', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPURenderTarget(state, 64, 64);
    resizeWebGPURenderTarget(state, target, 200, 150);
    expect(target.width).toBe(200);
    expect(target.height).toBe(150);
  });
});
