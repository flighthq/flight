import { createDisplayObject } from '@flighthq/displayobject';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import {
  defaultWebGPUDisplayObjectRenderer,
  drawWebGPUDisplayObject,
  renderWebGPUDisplayObject,
} from './webgpuDisplayObject';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUDisplayObjectRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUDisplayObjectRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUDisplayObjectRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUDisplayObject', () => {
  it('is a no-op (plain display objects have no geometry)', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const renderProxy = { source: createDisplayObject() } as never;
    expect(() => drawWebGPUDisplayObject(state, renderProxy)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});

describe('renderWebGPUDisplayObject', () => {
  it('traverses a display object without error', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const root = createDisplayObject();
    expect(() => renderWebGPUDisplayObject(state, root)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
