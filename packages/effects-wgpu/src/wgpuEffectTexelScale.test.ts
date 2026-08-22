import { describe, expect, it } from 'vitest';

import { getWgpuEffectLogicalResolution, getWgpuRenderTargetTexelScale } from './wgpuEffectTexelScale';

describe('getWgpuEffectLogicalResolution', () => {
  const state = { canvas: { width: 800, height: 600 } };

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

describe('getWgpuRenderTargetTexelScale', () => {
  it('derives integer texel density from target and canvas widths', () => {
    expect(getWgpuRenderTargetTexelScale(800, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(1600, 800)).toBe(2);
    expect(getWgpuRenderTargetTexelScale(2400, 800)).toBe(3);
  });

  it('falls back to one for invalid or undersized dimensions', () => {
    expect(getWgpuRenderTargetTexelScale(400, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(Number.NaN, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(800, 0)).toBe(1);
  });
});
