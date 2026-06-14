import { getSpriteRenderNode, prepareSpriteRender } from '@flighthq/render';
import { createQuadBatch } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUQuadBatchRenderer, drawWebGPUQuadBatch } from './webgpuQuadBatch';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUQuadBatchRenderer', () => {
  it('has createData and draw functions', () => {
    expect(typeof defaultWebGPUQuadBatchRenderer.createData).toBe('function');
    expect(typeof defaultWebGPUQuadBatchRenderer.draw).toBe('function');
  });
});

describe('drawWebGPUQuadBatch', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const batch = createQuadBatch();
    prepareSpriteRender(state, batch);
    const renderNode = getSpriteRenderNode(state, batch)!;

    expect(() => drawWebGPUQuadBatch(state, renderNode)).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
