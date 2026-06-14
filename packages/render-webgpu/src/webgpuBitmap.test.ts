import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUBitmapRenderer, drawWebGPUBitmap, drawWebGPUBitmapMask } from './webgpuBitmap';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUBitmapRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUBitmapRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUBitmapRenderer.draw).toBe('function');
  });
});

describe('drawWebGPUBitmap', () => {
  it('does not throw when image source is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);

    expect(() => drawWebGPUBitmap(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);

    expect(() => drawWebGPUBitmap(state, renderNode)).not.toThrow();
  });
});

describe('drawWebGPUBitmapMask', () => {
  it('delegates to drawWebGPUBitmap', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, bitmap);
    expect(() => drawWebGPUBitmapMask(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
