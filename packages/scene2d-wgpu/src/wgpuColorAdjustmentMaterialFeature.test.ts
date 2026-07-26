import { createImageResource } from '@flighthq/image/contract';
import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { ColorScaleBias } from '@flighthq/types/contract';

import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import {
  flushWgpuSpriteBatch,
  prepareWgpuSpriteBatchWrite,
  recordWgpuSpriteBatchColorScaleBias,
} from './wgpuSpriteBatch';
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
    expect(runtime.wgpuColorAdjustmentMaterialFeature).toBeDefined();
    expect(runtime.wgpuColorAdjustmentMaterialFeature).not.toBeNull();
  });

  it('is idempotent', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const fold = runtime.wgpuColorAdjustmentMaterialFeature;
    registerWgpuColorAdjustmentMaterialFeature(state);
    expect(runtime.wgpuColorAdjustmentMaterialFeature).toBe(fold);
  });

  it('stays untinted (mode NONE) when no instance carries a color adjustment', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, null, 0);
    recordWgpuSpriteBatchColorScaleBias(state, null, 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_NONE);
    expect(runtime.spriteBatchColorTintData).toBeUndefined();
    expect(runtime.spriteBatchColorScaleBiasData).toBeUndefined();
  });

  it('uses one whole-batch uniform when every instance shares one tint', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    const tint = ct(0.5);
    recordWgpuSpriteBatchColorScaleBias(state, tint, 0);
    recordWgpuSpriteBatchColorScaleBias(state, tint, 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.spriteBatchUniformColorScaleBias).toBe(tint);
  });

  it('promotes varying multiply-only tints to packed RGBA8 without splitting', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, ct(0.5), 0);
    recordWgpuSpriteBatchColorScaleBias(state, ct(0.25), 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.spriteBatchColorTintData!.buffer, 0, 8))).toEqual([
      128, 255, 255, 255, 64, 255, 255, 255,
    ]);
    expect(runtime.spriteBatchColorScaleBiasData).toBeUndefined();
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, null, 0);
    recordWgpuSpriteBatchColorScaleBias(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.spriteBatchColorTintData!.buffer, 0, 8))).toEqual([
      255, 255, 255, 255, 128, 255, 255, 255,
    ]);
  });

  it('replicates a uniform tint as four bytes per instance on flush', async () => {
    const state = await createWgpuRenderStateForTest();
    registerWgpuColorAdjustmentMaterialFeature(state);
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = createImageResource(document.createElement('img'));
    prepareWgpuSpriteBatchWrite(state, tex, null, null, standardWgpuMaterialRenderer, 2);
    recordWgpuSpriteBatchColorScaleBias(state, ct(0.5), 0);
    recordWgpuSpriteBatchColorScaleBias(state, ct(0.5), 1);
    runtime.spriteBatchCount = 2;
    flushWgpuSpriteBatch(state);
    expect(Array.from(new Uint8Array(runtime.spriteBatchColorTintData!.buffer, 0, 8))).toEqual([
      128, 255, 255, 255, 128, 255, 255, 255,
    ]);
    submitWgpuRenderPass(state);
  });

  it('records compact per-item tint data directly as one storage word', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, null, 0);
    recordWgpuSpriteBatchColorScaleBias(state, { tint: 0x12345678 }, 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.spriteBatchColorTintData!.buffer, 4, 4))).toEqual([
      0x12, 0x34, 0x56, 0x78,
    ]);
  });

  it('widens to the affine stream only when an offset appears', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, { tint: 0x808080ff }, 0);
    recordWgpuSpriteBatchColorScaleBias(state, ct(1, 1, 1, 1, 1), 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorScaleBiasData![0]).toBeCloseTo(128 / 255);
    expect(runtime.spriteBatchColorScaleBiasData![12]).toBe(1);
  });

  it('widens to a 20-float matrix stream only when channel mixing appears', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    registerWgpuColorAdjustmentMaterialFeature(state);
    recordWgpuSpriteBatchColorScaleBias(state, { tint: 0x808080ff }, 0);
    recordWgpuSpriteBatchColorScaleBias(state, MIX_RED_GREEN, 1);
    expect(runtime.spriteBatchColorScaleBiasMode).toBe(CT_MODE_MATRIX);
    expect(runtime.spriteBatchColorMatrixData![0]).toBeCloseTo(128 / 255);
    expect(runtime.spriteBatchColorMatrixData![20]).toBe(1);
    expect(runtime.spriteBatchColorMatrixData![21]).toBe(0.5);
    expect(runtime.spriteBatchColorMatrixData![36]).toBe(0.25);
  });
});
