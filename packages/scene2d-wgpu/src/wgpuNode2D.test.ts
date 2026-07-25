import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createDisplayObject } from '@flighthq/scene2d';

import { defaultWgpuScene2DRenderer, drawWgpuScene2D, renderWgpuScene2D } from './wgpuNode2D';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuScene2DRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWgpuScene2DRenderer.createData).toBe('function');
    expect(typeof defaultWgpuScene2DRenderer.submit).toBe('function');
  });
});

describe('drawWgpuScene2D', () => {
  it('is a no-op (plain display objects have no geometry)', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const renderProxy = { source: createDisplayObject() } as never;
    expect(() => drawWgpuScene2D(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('renderWgpuScene2D', () => {
  it('traverses a display object without error', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const root = createDisplayObject();
    expect(() => renderWgpuScene2D(state, root)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
