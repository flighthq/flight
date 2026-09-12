import { beginWgpuScreenRenderPassForTest, submitWgpuFrame } from '@flighthq/render-wgpu/contract';
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
  writeWgpuQuadBatchAffineInstance,
  writeWgpuQuadBatchInstance,
} from './wgpuQuadBatchWriter';
import { getWgpuRenderStats, resetWgpuRenderStats } from './wgpuRenderStats';
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
    beginWgpuScreenRenderPassForTest(state);
    expect(() => flushWgpuQuadBatchWriter(state)).not.toThrow();
    submitWgpuFrame(state);
  });

  it('resets state after flush', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);

    expect(runtime.quadBatchWriterCount).toBe(0);
    expect(runtime.quadBatchWriterTexture).toBeNull();
    expect(runtime.quadBatchWriterBlendMode).toBeNull();
    expect(runtime.quadBatchWriterMaterial).toBeNull();
    submitWgpuFrame(state);
  });

  it('records the flush in render stats, from the LIVE draw path', async () => {
    // The stats functions were unit-tested by calling recordWgpuBatchFlush directly, which is why the
    // production path could reach here recording nothing at all and every test still pass. This drives
    // the real flush and asserts the counters moved.
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    resetWgpuRenderStats(state);

    prepareWgpuQuadBatchWrite(state, makeTexture(), null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 3;
    flushWgpuQuadBatchWriter(state);

    const stats = getWgpuRenderStats(state);
    expect(stats.batchFlushCount).toBe(1);
    expect(stats.drawCallCount).toBe(1);
    // The instance count is the batch size, not one per flush — a caller reading this to size buffers
    // needs the quads, not the draws.
    expect(stats.instanceCount).toBe(3);
    submitWgpuFrame(state);
  });

  it('records nothing when the flush issues no draw', async () => {
    // An empty writer returns early without drawing. Counting that would report batches the GPU never
    // saw, which is worse than not counting at all: it makes a frame look busier than it was.
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    resetWgpuRenderStats(state);
    flushWgpuQuadBatchWriter(state);
    expect(getWgpuRenderStats(state).batchFlushCount).toBe(0);
    submitWgpuFrame(state);
  });

  it('claims a distinct buffer per flush so deferred draws never share one', async () => {
    // The canvas pass is submitted once at end of frame; if successive flushes reused one instance
    // buffer, every draw would read the last flush's data and the batch would collapse to one spot.
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
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
    submitWgpuFrame(state);
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
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex1 = makeTexture();
    const tex2 = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex1, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    prepareWgpuQuadBatchWrite(state, tex2, null, null, null, standardWgpuMaterialRenderer, 1);

    expect(runtime.quadBatchWriterTexture).toBe(tex2);
    expect(runtime.quadBatchWriterCount).toBe(0);
    submitWgpuFrame(state);
  });

  it('flushes when material changes', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();
    const materialA = makeMaterial();
    const materialB = makeMaterial();

    prepareWgpuQuadBatchWrite(state, tex, null, null, materialA, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    prepareWgpuQuadBatchWrite(state, tex, null, null, materialB, standardWgpuMaterialRenderer, 1);

    expect(runtime.quadBatchWriterMaterial).toBe(materialB);
    expect(runtime.quadBatchWriterCount).toBe(0);
    submitWgpuFrame(state);
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
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();
    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    recordWgpuQuadBatchColorScaleBias(state, null, 0);
    runtime.quadBatchWriterCount = 1;
    expect(() => flushWgpuQuadBatchWriter(state)).not.toThrow();
    submitWgpuFrame(state);
  });
});

describe('resetWgpuQuadBatchWriterBufferPool', () => {
  it('rewinds the pool cursor so slots are reclaimed next frame', async () => {
    const state = await createWgpuRenderStateForTest();
    beginWgpuScreenRenderPassForTest(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = makeTexture();

    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 1);
    runtime.quadBatchWriterCount = 1;
    flushWgpuQuadBatchWriter(state);
    expect(runtime.quadBatchWriterBufferCursor).toBe(1);

    resetWgpuQuadBatchWriterBufferPool(state);
    expect(runtime.quadBatchWriterBufferCursor).toBe(0);
    submitWgpuFrame(state);
  });
});

describe('writeWgpuQuadBatchAffineInstance', () => {
  it('packs pre-scaled geometry and two affine UV axes into thirteen floats', () => {
    const data = new Float32Array(13);
    writeWgpuQuadBatchAffineInstance(
      data,
      0,
      { a: 2, b: 3, c: 4, d: 5, tx: 6, ty: 7 },
      10,
      20,
      0.1,
      0.2,
      0.3,
      0.4,
      0.5,
      0.6,
      0.9,
    );
    expect(Array.from(data.slice(0, 6))).toEqual([20, 30, 80, 100, 6, 7]);
    [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9].forEach((expected, index) => expect(data[index + 6]).toBeCloseTo(expected));
  });
});

describe('writeWgpuQuadBatchInstance', () => {
  it('maps an axis-aligned UV rectangle onto the affine record', () => {
    const data = new Float32Array(13);
    writeWgpuQuadBatchInstance(data, 0, { a: 1, b: 0, c: 0, d: 1, tx: 2, ty: 3 }, 4, 5, 0.1, 0.2, 0.7, 0.8, 0.9);
    [0.1, 0.2, 0.6, 0, 0, 0.6, 0.9].forEach((expected, index) => expect(data[index + 6]).toBeCloseTo(expected));
  });
});
