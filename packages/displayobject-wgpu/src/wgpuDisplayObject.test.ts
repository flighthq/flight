import { createDisplayObject } from '@flighthq/displayobject';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';

import { defaultWgpuDisplayObjectRenderer, drawWgpuDisplayObject, renderWgpuDisplayObject } from './wgpuDisplayObject';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuDisplayObjectRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWgpuDisplayObjectRenderer.createData).toBe('function');
    expect(typeof defaultWgpuDisplayObjectRenderer.submit).toBe('function');
  });
});

describe('drawWgpuDisplayObject', () => {
  it('is a no-op (plain display objects have no geometry)', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const renderProxy = { source: createDisplayObject() } as never;
    expect(() => drawWgpuDisplayObject(state, renderProxy)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('renderWgpuDisplayObject', () => {
  it('traverses a display object without error', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const root = createDisplayObject();
    expect(() => renderWgpuDisplayObject(state, root)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
