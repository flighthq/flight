import { getRenderProxy2D, prepareSpriteRender } from '@flighthq/render';
import { createQuadBatch } from '@flighthq/sprite';

import { renderWebGPUBackground, submitWebGPURenderPass } from './webgpuBackground';
import { defaultWebGPUQuadBatchRenderer } from './webgpuQuadBatch';
import { flushWebGPUSpriteBatch } from './webgpuSpriteBatch';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';

beforeAll(() => {
  installWebGPUMock();
});

describe('defaultWebGPUQuadBatchRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWebGPUQuadBatchRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWebGPUQuadBatchRenderer.submit).toBe('function');
  });
});

describe('defaultWebGPUQuadBatchRenderer.submit', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWebGPURenderStateForTest();
    renderWebGPUBackground(state);

    const batch = createQuadBatch();
    prepareSpriteRender(state, batch);
    const renderProxy = getRenderProxy2D(state, batch)!;

    expect(() => {
      defaultWebGPUQuadBatchRenderer.submit(state, renderProxy);
      flushWebGPUSpriteBatch(state as any);
    }).not.toThrow();
    submitWebGPURenderPass(state);
  });
});
