import { getRenderProxy2D, prepareDisplayObjectRender } from '@flighthq/render';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createQuadBatch } from '@flighthq/sprite';

import { defaultWgpuQuadBatchRenderer, ensureWgpuQuadBatchResources, getWgpuQuadBatchPipeline } from './wgpuQuadBatch';
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

describe('ensureWgpuQuadBatchResources', () => {
  it('returns resources with bind group layouts and a pipelines WeakMap', async () => {
    const state = await createWgpuRenderStateForTest();
    const resources = ensureWgpuQuadBatchResources(state);
    expect(resources.instanceBindGroupLayout).toBeDefined();
    expect(resources.materialBindGroupLayout).toBeDefined();
    expect(resources.basePipelineLayout).toBeDefined();
    expect(resources.materialPipelineLayout).toBeDefined();
    expect(resources.pipelines).toBeInstanceOf(WeakMap);
  });

  it('is idempotent — returns the same resources on repeated calls', async () => {
    const state = await createWgpuRenderStateForTest();
    const r1 = ensureWgpuQuadBatchResources(state);
    const r2 = ensureWgpuQuadBatchResources(state);
    expect(r1).toBe(r2);
  });
});

describe('getWgpuQuadBatchPipeline', () => {
  it('creates and caches a pipeline for a given shader module', async () => {
    const state = await createWgpuRenderStateForTest();
    const resources = ensureWgpuQuadBatchResources(state);
    const module = state.device.createShaderModule({ code: '' });
    const pipeline = getWgpuQuadBatchPipeline(state, resources, module, false, null);
    expect(pipeline).toBeDefined();
    const pipeline2 = getWgpuQuadBatchPipeline(state, resources, module, false, null);
    expect(pipeline2).toBe(pipeline);
  });
});
