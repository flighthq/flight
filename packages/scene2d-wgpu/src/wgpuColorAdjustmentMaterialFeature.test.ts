import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuColorAdjustmentMaterialFeature, getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { areColorAdjustmentsEnabled } from '@flighthq/render/contract';
import type { ColorScaleBias } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import {
  flushWgpuQuadBatchWriter,
  prepareWgpuQuadBatchWrite,
  recordWgpuQuadBatchColorScaleBias,
} from './wgpuQuadBatchWriter';
import { standardWgpuMaterialRenderer } from './wgpuStandardMaterial';

beforeAll(() => {
  installWgpuMock();
});

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
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;
const CT_MODE_MATRIX = 4;
const MIX_RED_GREEN = [1, 0.5, 0, 0, 0.25, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] as const;

describe('registerWgpuColorAdjustmentMaterialFeature', () => {
  it('installs the fold so recorded tints drive the color-adjustment state machine', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    expect(areColorAdjustmentsEnabled(state)).toBe(true);
    expect(runtime.registries.colorAdjustmentFeature).toBeDefined();
    expect(getWgpuColorAdjustmentMaterialFeature(state)?.drawShapeMeshes).toBeTypeOf('function');
  });

  it('is idempotent', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const table = runtime.registries.colorAdjustmentFeature;
    const fold = getWgpuColorAdjustmentMaterialFeature(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    expect(runtime.registries.colorAdjustmentFeature).toBe(table);
    expect(getWgpuColorAdjustmentMaterialFeature(state)).toBe(fold);
  });

  it('stays untinted (mode NONE) when no instance carries a color adjustment', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(state, null, 0);
    recordWgpuQuadBatchColorScaleBias(state, null, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_NONE);
    expect(runtime.quadBatchWriterColorTintData).toBeUndefined();
    expect(runtime.quadBatchWriterColorScaleBiasData).toBeUndefined();
  });

  it('uses one whole-batch uniform when every instance shares one tint', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const tint = ct(0.5);
    recordWgpuQuadBatchColorScaleBias(state, tint, 0);
    recordWgpuQuadBatchColorScaleBias(state, tint, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.quadBatchWriterUniformColorScaleBias).toBe(tint);
  });

  it('promotes varying multiply-only tints to packed RGBA8 without splitting', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.25), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 0, 8))).toEqual([
      128, 255, 255, 255, 64, 255, 255, 255,
    ]);
    expect(runtime.quadBatchWriterColorScaleBiasData).toBeUndefined();
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(state, null, 0);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 0, 8))).toEqual([
      255, 255, 255, 255, 128, 255, 255, 255,
    ]);
  });

  it('replicates a uniform tint as four bytes per instance on flush', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuColorAdjustmentMaterialFeature(state);
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = {
      [EntityRuntimeKey]: undefined,
      bindings: new Map(),
      mipLevelCount: 1,
      texture: {} as GPUTexture,
      view: {} as GPUTextureView,
    };
    prepareWgpuQuadBatchWrite(state, tex, null, null, null, standardWgpuMaterialRenderer, 2);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordWgpuQuadBatchColorScaleBias(state, ct(0.5), 1);
    runtime.quadBatchWriterCount = 2;
    flushWgpuQuadBatchWriter(state);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 0, 8))).toEqual([
      128, 255, 255, 255, 128, 255, 255, 255,
    ]);
    submitWgpuRenderPass(state);
  });

  it('records compact per-item tint data directly as one storage word', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(state, null, 0);
    recordWgpuQuadBatchColorScaleBias(
      state,
      (() => {
        const out = allocateEntity<any>();
        out.tint = 0x12345678;
        return finishEntity(out);
      })(),
      1,
    );
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 4, 4))).toEqual([
      0x12, 0x34, 0x56, 0x78,
    ]);
  });

  it('widens to the affine stream only when an offset appears', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(
      state,
      (() => {
        const out = allocateEntity<any>();
        out.tint = 0x808080ff;
        return finishEntity(out);
      })(),
      0,
    );
    recordWgpuQuadBatchColorScaleBias(state, ct(1, 1, 1, 1, 1), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.quadBatchWriterColorScaleBiasData![0]).toBeCloseTo(128 / 255);
    expect(runtime.quadBatchWriterColorScaleBiasData![12]).toBe(1);
  });

  it('widens to a 20-float matrix stream only when channel mixing appears', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuQuadBatchColorScaleBias(
      state,
      (() => {
        const out = allocateEntity<any>();
        out.tint = 0x808080ff;
        return finishEntity(out);
      })(),
      0,
    );
    recordWgpuQuadBatchColorScaleBias(state, MIX_RED_GREEN, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_MATRIX);
    expect(runtime.quadBatchWriterColorMatrixData![0]).toBeCloseTo(128 / 255);
    expect(runtime.quadBatchWriterColorMatrixData![20]).toBe(1);
    expect(runtime.quadBatchWriterColorMatrixData![21]).toBe(0.5);
    expect(runtime.quadBatchWriterColorMatrixData![36]).toBe(0.25);
  });
});
