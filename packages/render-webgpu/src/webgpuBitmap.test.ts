import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUBitmapRenderer, drawWebGPUBitmap } from './webgpuBitmap';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUBitmapRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUBitmapRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUBitmapRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUBitmap', () => {
  it('does not throw when image source is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWebGPUBitmap(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWebGPUBitmap(state, renderProxy)).not.toThrow();
  });
});
