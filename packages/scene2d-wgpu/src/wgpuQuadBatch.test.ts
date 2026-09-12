import { createQuadBatch, reserveQuadBatch } from '@flighthq/quadbatch/contract';
import {
  beginWgpuScreenRenderPassForTest,
  getWgpuRenderStateRuntime,
  registerWgpuRenderTextureResolver,
  renderIntoWgpuRenderTexture,
  submitWgpuFrame,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getOrCreateRenderProxy2D, getRenderProxy2D, prepareScene2DRender } from '@flighthq/render/contract';
import { createRenderTexture } from '@flighthq/texture/contract';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas/contract';
import { TextureAtlasRotation } from '@flighthq/types/contract';

import { defaultWgpuQuadBatchRenderer, ensureWgpuQuadBatchResources, getWgpuQuadBatchPipeline } from './wgpuQuadBatch';
import { flushWgpuQuadBatchWriter } from './wgpuQuadBatchWriter';
import { registerWgpuStandardMaterial } from './wgpuStandardMaterial';

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
    beginWgpuScreenRenderPassForTest(state);

    const batch = createQuadBatch();
    prepareScene2DRender(state, batch);
    const renderProxy = getRenderProxy2D(state, batch)!;

    expect(() => {
      defaultWgpuQuadBatchRenderer.submit(state, renderProxy);
      flushWgpuQuadBatchWriter(state as any);
    }).not.toThrow();
    submitWgpuFrame(state);
  });

  it('packs a rotated region with upright geometry and affine UV axes', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    const texture = createRenderTexture({ height: 64, width: 64 });
    renderIntoWgpuRenderTexture(state, texture, () => {}, { color: [0, 0, 0, 0], depth: 1.0, stencil: 0 });
    const batch = createQuadBatch({
      data: {
        atlas: createTextureAtlas({
          regions: [
            createTextureAtlasRegion({
              height: 40,
              id: 0,
              rotation: TextureAtlasRotation.Clockwise90,
              width: 20,
              x: 0,
              y: 0,
            }),
          ],
          texture,
        }),
      },
    });
    reserveQuadBatch(batch, 1);
    batch.data.instanceCount = 1;
    batch.data.ids[0] = 0;
    prepareScene2DRender(state, batch);

    defaultWgpuQuadBatchRenderer.submit(state, getOrCreateRenderProxy2D(state, batch));

    const data = getWgpuRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(data[0]).toBeCloseTo(40);
    expect(data[3]).toBeCloseTo(20);
    expect(data[6]).toBeCloseTo(20 / 64);
    expect(data[7]).toBeCloseTo(0);
    expect(data[8]).toBeCloseTo(0);
    expect(data[9]).toBeCloseTo(40 / 64);
    expect(data[10]).toBeCloseTo(-20 / 64);
    expect(data[11]).toBeCloseTo(0);
    submitWgpuFrame(state);
  });

  it('packs libGDX counterclockwise regions with the opposite affine UV axes', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    registerWgpuRenderTextureResolver(state);
    registerWgpuStandardMaterial(state);
    const texture = createRenderTexture({ height: 64, width: 64 });
    renderIntoWgpuRenderTexture(state, texture, () => {}, { color: [0, 0, 0, 0], depth: 1.0, stencil: 0 });
    const batch = createQuadBatch({
      data: {
        atlas: createTextureAtlas({
          regions: [
            createTextureAtlasRegion({
              height: 40,
              id: 0,
              rotation: TextureAtlasRotation.Counterclockwise90,
              width: 20,
              x: 0,
              y: 0,
            }),
          ],
          texture,
        }),
      },
    });
    reserveQuadBatch(batch, 1);
    batch.data.instanceCount = 1;
    batch.data.ids[0] = 0;
    prepareScene2DRender(state, batch);

    defaultWgpuQuadBatchRenderer.submit(state, getOrCreateRenderProxy2D(state, batch));

    const data = getWgpuRenderStateRuntime(state).quadBatchWriterInstanceData;
    expect(data[6]).toBeCloseTo(0);
    expect(data[7]).toBeCloseTo(40 / 64);
    expect(data[9]).toBeCloseTo(-40 / 64);
    expect(data[10]).toBeCloseTo(20 / 64);
    submitWgpuFrame(state);
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
