import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { ColorScaleBias, Material, WgpuTextureEntry } from '@flighthq/types/contract';
import { BlendMode, EntityRuntimeKey } from '@flighthq/types/contract';

import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import {
  ensureWgpuQuadBatchResources,
  flushWgpuQuadBatchWriter,
  getWgpuQuadBatchPipeline,
  getWgpuQuadBatchPreludeWGSL,
  packWgpuQuadBatchMaterialInstance,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
  resetWgpuQuadBatchWriterBufferPool,
} from './wgpuQuadBatchWriter';
import { standardWgpuMaterialRenderer } from './wgpuStandardMaterial';

beforeAll(() => {
  installWgpuMock();
});

function makeMaterial(): Material {
  return { kind: 'TestMaterial' } as Material;
}

function makeTexture(): WgpuTextureEntry {
  return {
    [EntityRuntimeKey]: undefined,
    bindings: new Map(),
    mipLevelCount: 1,
    texture: {} as GPUTexture,
    view: {} as GPUTextureView,
  };
}

function ct(
  redScale = 1,
  greenScale = 1,
  blueScale = 1,
  alphaScale = 1,
  redBias = 0,
  greenBias = 0,
  blueBias = 0,
  alphaBias = 0,
): ColorScaleBias {
  return {
    redScale,
    greenScale,
    blueScale,
    alphaScale,
    redBias,
    greenBias,
    blueBias,
    alphaBias,
  } as ColorScaleBias;
}

const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;

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

describe('flushWgpuQuadBatchWriter', () => {
  it('does nothing when batch count is zero', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    expect(() => flushWgpuQuadBatchWriter(state)).not.toThrow();
    submitWgpuRenderPass(state);
  });

  it('resets state after flush', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);

    expect(runtime.quadBatchWriterCount).toBe(0);
    expect(runtime.quadBatchWriterTexture).toBeNull();
    expect(runtime.quadBatchWriterBlendMode).toBeNull();
    expect(runtime.quadBatchWriterMaterial).toBeNull();
    submitWgpuRenderPass(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex1, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);

    prepareWgpuQuadBatchWrite(state, tex2, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);

    expect(runtime.quadBatchWriterBufferCursor).toBe(2);
    expect(runtime.quadBatchWriterBufferPool[0].instanceBuffer).not.toBeNull();
    expect(runtime.quadBatchWriterBufferPool[0].instanceBuffer).not.toBe(
      runtime.quadBatchWriterBufferPool[1].instanceBuffer,
    );
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

  it('uses the shared fixed-function blend table for every batch mode', async () => {
    const state = await createWgpuRenderStateForTest();
    const resources = ensureWgpuQuadBatchResources(state);
    const module = state.device.createShaderModule({ code: '' });
    const blendOf = (mode: BlendMode) => {
      const pipeline = getWgpuQuadBatchPipeline(state, resources, module, false, mode) as unknown as {
        __descriptor: GPURenderPipelineDescriptor;
      };
      return [...pipeline.__descriptor.fragment!.targets][0]!.blend!.color;
    };

    expect(blendOf(BlendMode.Multiply)).toEqual({
      srcFactor: 'dst',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    });
    expect(blendOf(BlendMode.Screen)).toEqual({
      srcFactor: 'one',
      dstFactor: 'one-minus-src',
      operation: 'add',
    });
    expect(blendOf(BlendMode.Darken).operation).toBe('min');
    expect(blendOf(BlendMode.Lighten).operation).toBe('max');
  });
});

describe('getWgpuQuadBatchPreludeWGSL', () => {
  it('returns the shared WGSL prelude string containing the base structs', () => {
    const wgsl = getWgpuQuadBatchPreludeWGSL();
    expect(typeof wgsl).toBe('string');
    expect(wgsl).toContain('struct Uniforms');
    expect(wgsl).toContain('quadBaseVertex');
    expect(wgsl).toContain('straightTextureAlpha : u32');
  });
});

describe('packWgpuQuadBatchMaterialInstance', () => {
  it('is a no-op when no per-instance material data is active', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(() => packWgpuQuadBatchMaterialInstance(state, null, 0)).not.toThrow();
  });
});

describe('prepareWgpuQuadBatchWrite', () => {
  it('returns instance index 0 for an empty batch', async () => {
    const state = await createWgpuRenderStateForTest();
    const tex = makeTexture();

    const base = prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    expect(base).toBe(0);
  });

  it('flushes when texture changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex1, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    prepareWgpuQuadBatchWrite(state, tex2, null, null, null, standardWgpuMaterialRenderer, 1);

    expect(runtime.quadBatchWriterTexture).toBe(tex2);
    expect(runtime.quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWgpuQuadBatchWrite(state, tex, null, null, materialA, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    prepareWgpuQuadBatchWrite(state, tex, null, null, materialB, standardWgpuMaterialRenderer, 1);

    expect(runtime.quadBatchWriterMaterial).toBe(materialB);
    expect(runtime.quadBatchWriterCount).toBe(0);
    submitWgpuRenderPass(state);
  });
});

describe('recordWgpuQuadBatchColorScaleBias', () => {
  it('skips the tint and records no fold state when color adjustment is not enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 0);
    expect(runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
  });

  it('is a no-op for an untinted instance whether or not the fold is enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    expect(() => recordWgpuQuadBatchColorScaleBias(state, null, 0)).not.toThrow();
    expect(runtime.quadBatchWriterColorScaleBiasMode ?? CT_MODE_NONE).toBe(CT_MODE_NONE);
  });

  it('delegates to the installed fold when color adjustment is enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 0);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
  });

  it('an untinted batch on flush uses the lean material module (no fold)', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuColorAdjustmentMaterialFeature(state);
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();
    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    recordWgpuQuadBatchColorScaleBias(state, null, 0);
    runtime.quadBatchWriterCount = 1;
    expect(() => flushWgpuQuadBatchWriter(state)).not.toThrow();
    submitWgpuRenderPass(state);
  });
});

describe('resetWgpuQuadBatchWriterBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWgpuRenderStateForTest();
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);
    expect(runtime.quadBatchWriterBufferCursor).toBe(1);

    resetWgpuQuadBatchWriterBufferPool(state);
    expect(runtime.quadBatchWriterBufferCursor).toBe(0);
    submitWgpuRenderPass(state);
  });
});
