import { createShape } from '@flighthq/displayobject';
import { getOrCreateDisplayObjectRenderNode, prepareDisplayObjectRender } from '@flighthq/render';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUShapeRenderer, drawWebGPUShape, drawWebGPUShapeMask } from './webgpuShape';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUShapeRenderer', () => {
  it('has createData and submit functions', () => {
    expect(typeof defaultWebGPUShapeRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUShapeRenderer.submit).toBe('function');
  });
});

describe('drawWebGPUShape', () => {
  it('does not throw for empty shape commands', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const shape = createShape();
    prepareDisplayObjectRender(state, shape);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, shape);

    expect(() => drawWebGPUShape(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });

  it('does not throw when renderPass is null', async () => {
    const state = await createWebGPURenderStateForTest();
    const shape = createShape();
    prepareDisplayObjectRender(state, shape);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, shape);

    expect(() => drawWebGPUShape(state, renderNode)).not.toThrow();
  });
});

describe('drawWebGPUShapeMask', () => {
  it('delegates to drawWebGPUShape', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);
    const shape = createShape();
    prepareDisplayObjectRender(state, shape);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, shape);
    expect(() => drawWebGPUShapeMask(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
