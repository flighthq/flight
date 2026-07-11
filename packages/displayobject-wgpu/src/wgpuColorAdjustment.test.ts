import { renderWgpuBackground, submitWgpuRenderPass } from '@flighthq/render-wgpu';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { ColorTransform } from '@flighthq/types';

import { enableWgpuColorAdjustment } from './wgpuColorAdjustment';
import { defaultWgpuMaterialRenderer } from './wgpuDefaultMaterial';
import {
  flushWgpuSpriteBatch,
  prepareWgpuSpriteBatchWrite,
  recordWgpuSpriteBatchColorTransform,
} from './wgpuSpriteBatch';

beforeAll(() => {
  installWgpuMock();
});

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

describe('enableWgpuColorAdjustment', () => {
  it('installs the fold so recorded tints drive the color-adjustment state machine', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    expect(runtime.wgpuColorAdjustmentFold).toBeDefined();
    expect(runtime.wgpuColorAdjustmentFold).not.toBeNull();
  });

  it('is idempotent', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    const fold = runtime.wgpuColorAdjustmentFold;
    enableWgpuColorAdjustment(state);
    expect(runtime.wgpuColorAdjustmentFold).toBe(fold);
  });

  it('stays untinted (mode NONE) when no instance carries a color transform', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    recordWgpuSpriteBatchColorTransform(state, null, 0);
    recordWgpuSpriteBatchColorTransform(state, null, 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_NONE);
  });

  it('uses one whole-batch uniform when every instance shares one tint', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    const tint = ct(0.5);
    recordWgpuSpriteBatchColorTransform(state, tint, 0);
    recordWgpuSpriteBatchColorTransform(state, tint, 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_UNIFORM);
    expect(runtime.spriteBatchUniformColorTransform).toBe(tint);
  });

  it('promotes to per-instance (never splits) when tints diverge, back-filling the earlier tint', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    recordWgpuSpriteBatchColorTransform(state, ct(0.5), 0);
    recordWgpuSpriteBatchColorTransform(state, ct(0.25), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData![0]).toBe(0.5);
    expect(runtime.spriteBatchColorTransformData![8]).toBe(0.25);
  });

  it('promotes with identity fill when a tinted instance follows an untinted one', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    enableWgpuColorAdjustment(state);
    recordWgpuSpriteBatchColorTransform(state, null, 0);
    recordWgpuSpriteBatchColorTransform(state, ct(0.5), 1);
    expect(runtime.spriteBatchColorTransformMode).toBe(CT_MODE_PER_INSTANCE);
    expect(runtime.spriteBatchColorTransformData![0]).toBe(1);
    expect(runtime.spriteBatchColorTransformData![8]).toBe(0.5);
  });

  it('replicates the uniform tint per instance on flush', async () => {
    const state = await createWgpuRenderStateForTest();
    enableWgpuColorAdjustment(state);
    renderWgpuBackground(state);
    const runtime = getWgpuRenderStateRuntime(state);
    const tex = document.createElement('img');
    prepareWgpuSpriteBatchWrite(state, tex, null, null, defaultWgpuMaterialRenderer, 2);
    recordWgpuSpriteBatchColorTransform(state, ct(0.5), 0);
    recordWgpuSpriteBatchColorTransform(state, ct(0.5), 1);
    runtime.spriteBatchCount = 2;
    flushWgpuSpriteBatch(state);
    expect(runtime.spriteBatchColorTransformData![0]).toBe(0.5);
    expect(runtime.spriteBatchColorTransformData![8]).toBe(0.5);
    submitWgpuRenderPass(state);
  });
});
