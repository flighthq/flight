import type { ColorMatrixFilter } from '@flighthq/types';

import { createBevelFilter } from './bevelFilter';
import { equalsBitmapFilter } from './bitmapFilterOps';
import { enumerateBitmapFilterKinds, fromBitmapFilterData, toBitmapFilterData } from './bitmapFilterSerialization';
import { createBlurFilter } from './blurFilter';
import { createColorMatrixFilter } from './colorMatrixFilter';
import { createConvolutionFilter } from './convolutionFilter';
import { createDisplacementMapFilter } from './displacementMapFilter';
import { createDropShadowFilter } from './dropShadowFilter';
import { createGradientBevelFilter } from './gradientBevelFilter';
import { createGradientGlowFilter } from './gradientGlowFilter';
import { createInnerGlowFilter } from './innerGlowFilter';
import { createInnerShadowFilter } from './innerShadowFilter';
import { createMedianFilter } from './medianFilter';
import { createOuterGlowFilter } from './outerGlowFilter';
import { createPixelateFilter } from './pixelateFilter';
import { createSharpenFilter } from './sharpenFilter';

const ALL_FILTERS = [
  createBevelFilter({ blurX: 4 }),
  createBlurFilter({ blurX: 4, blurY: 8 }),
  createColorMatrixFilter(new Array(20).fill(0)),
  createConvolutionFilter({ matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0], matrixX: 3, matrixY: 3 }),
  createDisplacementMapFilter({ scaleX: 10 }),
  createDropShadowFilter({ distance: 6 }),
  createGradientBevelFilter({ alphas: [1, 0], colors: [0xff0000ff, 0x000000ff], ratios: [0, 255] }),
  createGradientGlowFilter({ alphas: [1, 0], colors: [0xff0000ff, 0x000000ff], ratios: [0, 255] }),
  createInnerGlowFilter({ color: 0xff0000ff }),
  createInnerShadowFilter({ distance: 4 }),
  createMedianFilter({ radius: 2 }),
  createOuterGlowFilter({ color: 0x00ff00ff }),
  createPixelateFilter({ blockSize: 4 }),
  createSharpenFilter({ amount: 2 }),
];

describe('enumerateBitmapFilterKinds', () => {
  it('returns a non-empty list', () => {
    expect(enumerateBitmapFilterKinds().length).toBeGreaterThan(0);
  });

  it('includes BlurFilter', () => {
    expect(enumerateBitmapFilterKinds()).toContain('BlurFilter');
  });

  it('includes all 14 built-in kinds', () => {
    expect(enumerateBitmapFilterKinds()).toHaveLength(14);
  });
});

describe('fromBitmapFilterData', () => {
  it('returns null for null', () => {
    expect(fromBitmapFilterData(null)).toBeNull();
  });

  it('returns null for a primitive', () => {
    expect(fromBitmapFilterData(42)).toBeNull();
  });

  it('returns null for an unknown kind', () => {
    expect(fromBitmapFilterData({ kind: 'CustomFilter' })).toBeNull();
  });

  it('returns null when kind is missing', () => {
    expect(fromBitmapFilterData({ blurX: 4 })).toBeNull();
  });

  it('reconstructs a known filter', () => {
    const result = fromBitmapFilterData({ kind: 'BlurFilter', blurX: 4 });
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('BlurFilter');
  });

  it('deep copies array fields from input', () => {
    const matrix = new Array(20).fill(1);
    const result = fromBitmapFilterData({ kind: 'ColorMatrixFilter', matrix });
    expect(result).not.toBeNull();
    expect((result as ColorMatrixFilter).matrix).not.toBe(matrix);
  });
});

describe('round-trip: toBitmapFilterData → fromBitmapFilterData', () => {
  for (const filter of ALL_FILTERS) {
    it(`round-trips ${filter.kind}`, () => {
      const data = toBitmapFilterData(filter);
      const restored = fromBitmapFilterData(data);
      expect(restored).not.toBeNull();
      expect(equalsBitmapFilter(filter, restored!)).toBe(true);
    });
  }
});

describe('toBitmapFilterData', () => {
  it('returns a plain object with the same fields', () => {
    const f = createBlurFilter({ blurX: 4 });
    const data = toBitmapFilterData(f);
    expect(data['kind']).toBe('BlurFilter');
    expect(data['blurX']).toBe(4);
  });

  it('deep copies array fields', () => {
    const matrix = new Array(20).fill(0);
    const f = createColorMatrixFilter(matrix);
    const data = toBitmapFilterData(f);
    expect(data['matrix']).not.toBe(matrix);
  });
});
