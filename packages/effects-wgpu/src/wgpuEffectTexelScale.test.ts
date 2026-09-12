import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  getWgpuEffectLogicalResolution,
  getWgpuEffectLogicalWidth,
  getWgpuRenderTargetTexelScale,
} from './wgpuEffectTexelScale';

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

  it('falls back to one for invalid or undersized dimensions', () => {
    expect(getWgpuRenderTargetTexelScale(400, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(Number.NaN, 800)).toBe(1);
    expect(getWgpuRenderTargetTexelScale(800, 0)).toBe(1);
  });
});
