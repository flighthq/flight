import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

import type { WebGPURenderStateInternal } from './internal';
import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { drawWebGPUColorTransformBitmap, registerWebGPUColorTransformShader } from './webgpuMaterials';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('drawWebGPUColorTransformBitmap', () => {
  it('does not throw when render pass is open', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const fakeRenderNode = {
      alpha: 1,
      useColorTransform: false,
      colorTransform: null,
      transform2D: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      blendMode: null,
    };
    expect(() =>
      drawWebGPUColorTransformBitmap(internal, fakeRenderNode, canvas, 0, 0, 4, 4, 0, 0, 1, 1),
    ).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('registerWebGPUColorTransformShader', () => {
  it('registers the color transform shader on the state', async () => {
    const state = await createWebGPURenderStateForTest();
    registerWebGPUColorTransformShader(state);
    const internal = state as unknown as WebGPURenderStateInternal;
    expect(internal.colorTransformBitmapShader).toBeDefined();
  });

  it('is idempotent — calling twice does not throw', async () => {
    const state = await createWebGPURenderStateForTest();
    registerWebGPUColorTransformShader(state);
    expect(() => registerWebGPUColorTransformShader(state)).not.toThrow();
  });
});
