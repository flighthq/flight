import { getGlColorAdjustmentMaterialFeature, getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import { areColorAdjustmentsEnabled } from '@flighthq/render/contract';
import type { ColorScaleBias } from '@flighthq/types/contract';

import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import { flushGlQuadBatchWriter, prepareGlQuadBatchWrite, recordGlQuadBatchColorScaleBias } from './glQuadBatchWriter';
import { standardGlMaterialRenderer } from './glStandardMaterial';
import { createGlState } from './glTestHelper';

function makeTexture(): WebGLTexture {
  return {} as WebGLTexture;
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
const CT_MODE_PACKED_TINT = 2;
const CT_MODE_PER_INSTANCE = 3;
const CT_MODE_MATRIX = 4;
const MIX_RED_GREEN = [1, 0.5, 0, 0, 0.25, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] as const;

describe('registerGlColorAdjustmentMaterialFeature', () => {
  it('installs the fold so recorded tints drive the color-adjustment state machine', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    expect(areColorAdjustmentsEnabled(state)).toBe(true);
    expect(runtime.registries.colorAdjustmentFeature).toBeDefined();
    expect(getGlColorAdjustmentMaterialFeature(state)).not.toBeNull();
  });

  it('is idempotent', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    const table = runtime.registries.colorAdjustmentFeature;
    const fold = getGlColorAdjustmentMaterialFeature(state);
    registerGlColorAdjustmentMaterialFeature(state);
    expect(runtime.registries.colorAdjustmentFeature).toBe(table);
    expect(getGlColorAdjustmentMaterialFeature(state)).toBe(fold);
  });

  it('stays untinted (mode NONE) when no instance carries a color adjustment', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, null, 0);
    recordGlQuadBatchColorScaleBias(state, null, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_NONE);
    expect(runtime.quadBatchWriterColorTintData).toBeUndefined();
    expect(runtime.quadBatchWriterColorScaleBiasData).toBeUndefined();
  });

  it('uses one whole-batch uniform when every instance shares one tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    const tint = ct(0.5);
    recordGlQuadBatchColorScaleBias(state, tint, 0);
    recordGlQuadBatchColorScaleBias(state, tint, 1);
    recordGlQuadBatchColorScaleBias(state, tint, 2);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.quadBatchWriterUniformColorScaleBias).toBe(tint);
  });

  it('keeps the uniform path for a distinct-but-equal tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_UNIFORM);
  });

  it('promotes varying multiply-only tints to packed RGBA8 without splitting', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.25), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 0, 8))).toEqual([
      128, 255, 255, 255, 64, 255, 255, 255,
    ]);
    expect(runtime.quadBatchWriterColorScaleBiasData).toBeUndefined();
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, null, 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 0, 8))).toEqual([
      255, 255, 255, 255, 128, 255, 255, 255,
    ]);
  });

  it('writes identity for an untinted instance once the batch is per-instance', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.25), 1);
    recordGlQuadBatchColorScaleBias(state, null, 2);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 8, 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it('stores normalized-linear color biases without conversion', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, ct(1, 1, 1, 1, 1, 0, 0, 0), 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 1);
    expect(runtime.quadBatchWriterColorScaleBiasData![4]).toBe(1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PER_INSTANCE);
  });

  it('widens to a full matrix stream only when channel mixing appears', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, { tint: 0x808080ff }, 0);
    recordGlQuadBatchColorScaleBias(state, MIX_RED_GREEN, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_MATRIX);
    expect(runtime.quadBatchWriterColorMatrixData![0]).toBeCloseTo(128 / 255);
    expect(runtime.quadBatchWriterColorMatrixData![20]).toBe(1);
    expect(runtime.quadBatchWriterColorMatrixData![21]).toBe(0.5);
    expect(runtime.quadBatchWriterColorMatrixData![36]).toBe(0.25);
  });

  it('records compact per-item tint data directly as four bytes', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    recordGlQuadBatchColorScaleBias(state, null, 0);
    recordGlQuadBatchColorScaleBias(state, { tint: 0x12345678 }, 1);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_PACKED_TINT);
    expect(Array.from(new Uint8Array(runtime.quadBatchWriterColorTintData!.buffer, 4, 4))).toEqual([
      0x12, 0x34, 0x56, 0x78,
    ]);
  });

  it('drives the uniform color-adjustment shader on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    prepareGlQuadBatchWrite(state, makeTexture(), false, null, null, null, standardGlMaterialRenderer, 1);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    runtime.quadBatchWriterCount = 1;
    flushGlQuadBatchWriter(state);
    expect(gl.uniform4f).toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('uploads a four-byte per-instance tint buffer on flush when tints vary', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    prepareGlQuadBatchWrite(state, makeTexture(), false, null, null, null, standardGlMaterialRenderer, 2);
    recordGlQuadBatchColorScaleBias(state, ct(0.5), 0);
    recordGlQuadBatchColorScaleBias(state, ct(0.25), 1);
    runtime.quadBatchWriterCount = 2;
    flushGlQuadBatchWriter(state);
    expect(runtime.context.quadBatchResources?.writerColorScaleBiasBuffer).not.toBeNull();
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(7, 4, gl.UNSIGNED_BYTE, true, 4, 0);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('binds five vec4 instance attributes for a full color matrix', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    prepareGlQuadBatchWrite(state, makeTexture(), false, null, null, null, standardGlMaterialRenderer, 2);
    recordGlQuadBatchColorScaleBias(state, null, 0);
    recordGlQuadBatchColorScaleBias(state, MIX_RED_GREEN, 1);
    runtime.quadBatchWriterCount = 2;
    flushGlQuadBatchWriter(state);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(7, 4, gl.FLOAT, false, 80, 0);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(11, 4, gl.FLOAT, false, 80, 64);
  });

  it('resets the batch mode after flushing one uniform matrix', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    prepareGlQuadBatchWrite(state, makeTexture(), false, null, null, null, standardGlMaterialRenderer, 1);
    recordGlQuadBatchColorScaleBias(state, MIX_RED_GREEN, 0);
    runtime.quadBatchWriterCount = 1;
    flushGlQuadBatchWriter(state);
    expect(runtime.quadBatchWriterColorScaleBiasMode).toBe(CT_MODE_NONE);
  });

  it('leaves the lean base shader untouched for an untinted batch on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    registerGlColorAdjustmentMaterialFeature(state);
    prepareGlQuadBatchWrite(state, makeTexture(), false, null, null, null, standardGlMaterialRenderer, 1);
    recordGlQuadBatchColorScaleBias(state, null, 0);
    runtime.quadBatchWriterCount = 1;
    flushGlQuadBatchWriter(state);
    expect(runtime.context.quadBatchResources?.writerColorScaleBiasBuffer ?? null).toBeNull();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });
});
