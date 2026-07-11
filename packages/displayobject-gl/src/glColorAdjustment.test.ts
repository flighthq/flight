import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ColorTransform } from '@flighthq/types';

import { enableGlColorAdjustment } from './glColorAdjustment';
import { defaultGlMaterialRenderer } from './glDefaultMaterial';
import { flushGlSpriteBatch, prepareGlSpriteBatchWrite, recordGlSpriteBatchColorTransform } from './glSpriteBatch';
import { createGlState } from './glTestHelper';

function makeTexture(): HTMLImageElement {
  return document.createElement('img');
}

function ct(
  redMultiplier = 1,
  greenMultiplier = 1,
  blueMultiplier = 1,
  alphaMultiplier = 1,
  redOffset = 0,
  greenOffset = 0,
  blueOffset = 0,
  alphaOffset = 0,
): ColorTransform {
  return {
    redMultiplier,
    greenMultiplier,
    blueMultiplier,
    alphaMultiplier,
    redOffset,
    greenOffset,
    blueOffset,
    alphaOffset,
  } as ColorTransform;
}

const CT_MODE_NONE = 0;
const CT_MODE_UNIFORM = 1;
const CT_MODE_PER_INSTANCE = 2;

describe('enableGlColorAdjustment', () => {
  it('installs the fold so recorded tints drive the color-adjustment state machine', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    expect(runtime.glColorAdjustmentFold).not.toBeNull();
    expect(runtime.glColorAdjustmentFold).toBeDefined();
  });

  it('is idempotent', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    const fold = runtime.glColorAdjustmentFold;
    enableGlColorAdjustment(state);
    expect(runtime.glColorAdjustmentFold).toBe(fold);
  });

  it('stays untinted (mode NONE) when no instance carries a color transform', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, null, 0);
    recordGlSpriteBatchColorTransform(state, null, 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_NONE);
  });

  it('uses one whole-batch uniform when every instance shares one tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    const tint = ct(0.5);
    recordGlSpriteBatchColorTransform(state, tint, 0);
    recordGlSpriteBatchColorTransform(state, tint, 1);
    recordGlSpriteBatchColorTransform(state, tint, 2);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.spriteBatchUniformColorTransform).toBe(tint);
  });

  it('keeps the uniform path for a distinct-but-equal tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
  });

  it('promotes to per-instance (never splits) when tints diverge, back-filling the earlier tint', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData![0]).toBe(0.5);
    expect(runtime.spriteBatchColorTransformData![8]).toBe(0.25);
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, null, 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData![0]).toBe(1);
    expect(runtime.spriteBatchColorTransformData![8]).toBe(0.5);
  });

  it('writes identity for an untinted instance once the batch is per-instance', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    recordGlSpriteBatchColorTransform(state, null, 2);
    expect(runtime.spriteBatchColorTransformData![16]).toBe(1);
    expect(runtime.spriteBatchColorTransformData![20]).toBe(0);
  });

  it('normalizes color offsets by 255', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    recordGlSpriteBatchColorTransform(state, ct(1, 1, 1, 1, 255, 0, 0, 0), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformData![4]).toBe(1);
  });

  it('drives the uniform color-transform shader on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 1);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    runtime.spriteBatchCount = 1;
    flushGlSpriteBatch(state);
    expect(gl.uniform4f).toHaveBeenCalled();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });

  it('uploads a per-instance color-transform buffer on flush when tints vary', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 2);
    recordGlSpriteBatchColorTransform(state, ct(0.5), 0);
    recordGlSpriteBatchColorTransform(state, ct(0.25), 1);
    runtime.spriteBatchCount = 2;
    flushGlSpriteBatch(state);
    expect(runtime.spriteBatchColorTransformBuffer).not.toBeNull();
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(expect.anything(), 6, expect.anything(), 0, 2);
  });

  it('leaves the lean base shader untouched for an untinted batch on flush', () => {
    const { state, gl } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    enableGlColorAdjustment(state);
    prepareGlSpriteBatchWrite(state, makeTexture(), null, null, defaultGlMaterialRenderer, 1);
    recordGlSpriteBatchColorTransform(state, null, 0);
    runtime.spriteBatchCount = 1;
    flushGlSpriteBatch(state);
    expect(runtime.spriteBatchColorTransformBuffer ?? null).toBeNull();
    expect(gl.drawElementsInstanced).toHaveBeenCalled();
  });
});
