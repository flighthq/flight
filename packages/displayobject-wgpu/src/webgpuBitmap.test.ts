import { createBitmap } from '@flighthq/displayobject';
import { getOrCreateRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { defaultWgpuBitmapRenderer, drawWgpuBitmap } from './webgpuBitmap';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuBitmapRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWgpuBitmapRenderer.createData).toBe('function');
    expect(typeof defaultWgpuBitmapRenderer.submit).toBe('function');
  });
});

describe('drawWgpuBitmap', () => {
  it('does not throw when image source is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWgpuBitmap(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    prepareDisplayObjectRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWgpuBitmap(state, renderProxy)).not.toThrow();
  });
});
