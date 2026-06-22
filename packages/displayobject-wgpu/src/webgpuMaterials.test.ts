import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { drawWgpuColorTransformBitmap, registerWgpuColorTransformShader } from './webgpuMaterials';

beforeAll(() => {
  installWgpuMock();
});

describe('drawWgpuColorTransformBitmap', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const fakeRenderProxy = {
      alpha: 1,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      blendMode: null,
    };
    expect(() => drawWgpuColorTransformBitmap(state, fakeRenderProxy, canvas, 0, 0, 4, 4, 0, 0, 1, 1)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('registerWgpuColorTransformShader', () => {
  it('registers the color transform shader on the state', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuColorTransformShader(state);
    expect(getWgpuRenderStateRuntime(state).colorTransformBitmapShader).toBeDefined();
  });

  it('is idempotent — calling twice does not throw', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuColorTransformShader(state);
    expect(() => registerWgpuColorTransformShader(state)).not.toThrow();
  });
});
