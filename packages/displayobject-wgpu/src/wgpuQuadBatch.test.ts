import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createQuadBatch } from '@flighthq/sprite';

import { defaultWgpuQuadBatchRenderer } from './wgpuQuadBatch';
import { flushWgpuSpriteBatch } from './wgpuSpriteBatch';

beforeAll(() => {
  installWgpuMock();
});

describe('defaultWgpuQuadBatchRenderer', () => {
  it('has a createData function', () => {
    expect(typeof defaultWgpuQuadBatchRenderer.createData).toBe('function');
  });

  it('has a submit function', () => {
    expect(typeof defaultWgpuQuadBatchRenderer.submit).toBe('function');
  });
});

describe('defaultWgpuQuadBatchRenderer.submit', () => {
  it('does not throw when atlas is null', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);

    const batch = createQuadBatch();
    prepareDisplayObjectRender(state, batch);
    const renderProxy = getRenderProxy2D(state, batch)!;

    expect(() => {
      defaultWgpuQuadBatchRenderer.submit(state, renderProxy);
      flushWgpuSpriteBatch(state as any);
    }).not.toThrow();
    submitWgpuRenderPass(state);
  });
});
