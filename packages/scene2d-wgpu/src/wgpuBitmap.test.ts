import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createBitmap } from '@flighthq/scene2d/contract';

import { defaultWgpuBitmapRenderer, drawWgpuBitmap } from './wgpuBitmap';

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
    prepareScene2DRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWgpuBitmap(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWgpuRenderStateForTest();
    const bitmap = createBitmap();
    prepareScene2DRender(state, bitmap);
    const renderProxy = getOrCreateRenderProxy2D(state, bitmap);

    expect(() => drawWgpuBitmap(state, renderProxy)).not.toThrow();
  });
});
