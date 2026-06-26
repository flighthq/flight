import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { Material } from '@flighthq/types';

import { defaultWgpuMaterialRenderer } from './wgpuDefaultMaterial';
import {
  ensureWgpuQuadBatchResources,
  flushWgpuSpriteBatch,
  getWgpuQuadBatchPipeline,
  getWgpuQuadBatchPreludeWGSL,
  packWgpuSpriteBatchMaterialInstance,
  prepareWgpuSpriteBatchWrite,
  resetWgpuSpriteBatchBufferPool,
} from './wgpuSpriteBatch';

beforeAll(() => {
  installWgpuMock();
});

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

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

describe('flushWgpuSpriteBatch', () => {
  it('does nothing when batch count is zero', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(() => flushWgpuSpriteBatch(state)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('resets state after flush', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    expect(runtime.spriteBatchCount).toBe(0);
    expect(runtime.spriteBatchTexture).toBeNull();
    expect(runtime.spriteBatchBlendMode).toBeNull();
    expect(runtime.spriteBatchMaterial).toBeNull();
    submitWgpuRenderPass(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex1, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    prepareWgpuSpriteBatchWrite(state, tex2, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);

    expect(runtime.spriteBatchBufferCursor).toBe(2);
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBeNull();
    expect(runtime.spriteBatchBufferPool[0].instanceBuffer).not.toBe(runtime.spriteBatchBufferPool[1].instanceBuffer);
    submitWgpuRenderPass(state);
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

describe('getWgpuQuadBatchPreludeWGSL', () => {
  it('returns the shared WGSL prelude string containing the base structs', () => {
    const wgsl = getWgpuQuadBatchPreludeWGSL();
    expect(typeof wgsl).toBe('string');
    expect(wgsl).toContain('struct Uniforms');
    expect(wgsl).toContain('quadBaseVertex');
  });
});

describe('packWgpuSpriteBatchMaterialInstance', () => {
  it('is a no-op when no per-instance material data is active', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => packWgpuSpriteBatchMaterialInstance(state, null, 0)).not.toThrow();
  });
});

describe('prepareWgpuSpriteBatchWrite', () => {
  it('returns float index 0 for an empty batch', async () => {
    const state = await createWgpuRenderStateForTest();
    const tex = document.createElement('img');

    const base = prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = document.createElement('img');
    const tex2 = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex1, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWgpuSpriteBatchWrite(state, tex2, null, null, defaultWgpuMaterialRenderer, 1);

    expect(runtime.spriteBatchTexture).toBe(tex2);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWgpuSpriteBatchWrite(state, tex, null, materialA, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    prepareWgpuSpriteBatchWrite(state, tex, null, materialB, defaultWgpuMaterialRenderer, 1);

    expect(runtime.spriteBatchMaterial).toBe(materialB);
    expect(runtime.spriteBatchCount).toBe(0);
    submitWgpuRenderPass(state);
  });
});

describe('resetWgpuSpriteBatchBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');

    prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 1);
    runtime.spriteBatchCount = 1;
    flushWgpuSpriteBatch(state);
    expect(runtime.spriteBatchBufferCursor).toBe(1);

    resetWgpuSpriteBatchBufferPool(state);
    expect(runtime.spriteBatchBufferCursor).toBe(0);
    submitWgpuRenderPass(state);
  });
});
