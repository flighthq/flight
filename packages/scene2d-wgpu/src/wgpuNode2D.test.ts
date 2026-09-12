import { beginWgpuScreenRenderPassForTest, submitWgpuFrame } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

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
    beginWgpuScreenRenderPassForTest(state);
    const renderProxy = { source: createDisplayObject() } as never;
    expect(() => drawWgpuScene2D(state, renderProxy)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('renderWgpuScene2D', () => {
  it('traverses a display object without error', async () => {
    const state = await createWgpuRenderStateForTest();
    const pass = beginWgpuScreenRenderPassForTest(state);
    const root = createDisplayObject();
    expect(() => renderWgpuScene2D(pass, root)).not.toThrow();
    submitWgpuFrame(state);
  });
});
