import { EntityRuntimeKey } from '@flighthq/entity/contract';
import { describe, expect, it } from 'vitest';

import {
  getWgpuEffectLogicalResolution,
  getWgpuEffectLogicalWidth,
  getWgpuRenderTargetTexelScale,
} from './wgpuEffectTexelScale.ts';

describe('getWgpuEffectLogicalResolution', () => {
  // Logical pixels are the open pass's viewport: a scratch target twice that wide holds two texels per
  // logical pixel, whatever its own sample count says.
  const state = { [EntityRuntimeKey]: { passStack: [{ viewport: { height: 600, width: 800 } }] } };

  it('preserves native target dimensions', () => {
    expect(
      getWgpuEffectLogicalResolution(
        state as never,
        {
          width: 800,
          height: 600,
          sampleCount: 1,
        } as never,
      ),
    ).toEqual({ width: 800, height: 600, texelsPerLogicalPixel: 1 });
  });

  it('normalizes supersampled scratch targets even when their sample count is one', () => {
    expect(
      getWgpuEffectLogicalResolution(
        state as never,
        {
          width: 1600,
          height: 1200,
          sampleCount: 1,
        } as never,
      ),
    ).toEqual({ width: 800, height: 600, texelsPerLogicalPixel: 2 });
  });
});

describe('getWgpuEffectLogicalWidth', () => {
  it('measures against the open pass viewport while a chain runs inside a frame', () => {
    const state = { [EntityRuntimeKey]: { passStack: [{ viewport: { height: 600, width: 800 } }] } };

    expect(getWgpuEffectLogicalWidth(state as never, { width: 1600 } as never)).toBe(800);
  });

  // The render-texture path applies effects with no enclosing pass: there the target IS the logical
  // space, and measuring against a canvas that is not being drawn into would scale every distance by an
  // unrelated ratio.
  it('falls back to the target itself when no pass is open', () => {
    const state = { [EntityRuntimeKey]: { passStack: [] } };

    expect(getWgpuEffectLogicalWidth(state as never, { width: 16 } as never)).toBe(16);
  });
});

describe('getWgpuRenderTargetTexelScale', () => {
  it('derives integer texel density from target and canvas widths', () => {
    expect(getWgpuRenderTargetTexelScale(800, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(1600, 800)).toBe(2);
    expect(getWgpuRenderTargetTexelScale(2400, 800)).toBe(3);
  });

  // ★ THE DEFECT: sigma is in logical pixels, the pass steps in texels, and a supersampled effect target
  // holds two texels per logical pixel. Every blur-based Wgpu effect ran half as wide as its Gl twin.
  // Measured on effect-bloom, halo mean wgpu-webgl: -15.87 before, +1.12 after, with 41% of halo pixels
  // darker and 0% brighter beforehand — one-directional, which is a too-narrow blur rather than a
  // different one.
  it('reports 2 for a supersampled target and 1 at native density', () => {
    expect(getWgpuRenderTargetTexelScale(1600, 800)).toBe(2);
    expect(getWgpuRenderTargetTexelScale(800, 800)).toBe(1);
  });

  // A target SMALLER than the canvas is a downsampled chain, not a negative supersample: scaling sigma
  // below its authored value would narrow the blur further, so the factor floors at 1.
  it('never scales below 1', () => {
    expect(getWgpuRenderTargetTexelScale(400, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(1, 800)).toBe(1);
  });

  // Degenerate inputs return the identity rather than NaN or Infinity: a bad scale silently multiplies
  // sigma and the failure would surface as a wrong picture rather than an error.
  it('returns 1 for a zero or non-finite width instead of propagating it', () => {
    expect(getWgpuRenderTargetTexelScale(800, 0)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(Number.NaN, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(800, Number.POSITIVE_INFINITY)).toBe(1);
  });
});
