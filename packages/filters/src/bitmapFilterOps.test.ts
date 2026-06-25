import type { BlurFilter, ConvolutionFilter, DropShadowFilter } from '@flighthq/types';

import {
  cloneBitmapFilter,
  cloneBitmapFilterList,
  copyBitmapFilterInto,
  DEFAULT_FILTER_ALPHA,
  DEFAULT_FILTER_ANGLE,
  DEFAULT_FILTER_BLUR_X,
  DEFAULT_FILTER_BLUR_Y,
  DEFAULT_FILTER_COLOR,
  DEFAULT_FILTER_DISTANCE,
  DEFAULT_FILTER_KNOCKOUT,
  DEFAULT_FILTER_QUALITY,
  DEFAULT_FILTER_STRENGTH,
  equalsBitmapFilter,
  equalsBitmapFilterList,
  normalizeBitmapFilter,
} from './bitmapFilterOps';
import { createBlurFilter } from './blurFilter';
import { createColorMatrixFilter } from './colorMatrixFilter';
import { createConvolutionFilter } from './convolutionFilter';
import { createDropShadowFilter } from './dropShadowFilter';
import { createGradientGlowFilter } from './gradientGlowFilter';

describe('cloneBitmapFilter', () => {
  it('returns a new object equal to the source', () => {
    const f = createBlurFilter({ blurX: 4, blurY: 8 });
    const c = cloneBitmapFilter(f);
    expect(c).not.toBe(f);
    expect(c).toEqual(f);
  });

  it('deep copies array fields', () => {
    const matrix = new Array(20).fill(0);
    const f = createColorMatrixFilter(matrix);
    const c = cloneBitmapFilter(f);
    expect(c.matrix).not.toBe(f.matrix);
    expect(c.matrix).toEqual(f.matrix);
  });

  it('deep copies gradient color/alpha/ratio arrays', () => {
    const f = createGradientGlowFilter({
      alphas: [1, 0],
      colors: [0xff0000ff, 0x0000ffff],
      ratios: [0, 255],
    });
    const c = cloneBitmapFilter(f);
    expect(c.colors).not.toBe(f.colors);
    expect(c.alphas).not.toBe(f.alphas);
    expect(c.ratios).not.toBe(f.ratios);
  });
});

describe('cloneBitmapFilterList', () => {
  it('returns a new list with cloned filters', () => {
    const filters = [createBlurFilter({ blurX: 4 }), createDropShadowFilter({ distance: 6 })];
    const cloned = cloneBitmapFilterList(filters);
    expect(cloned).not.toBe(filters);
    expect(cloned.length).toBe(2);
    expect(cloned[0]).not.toBe(filters[0]);
    expect(cloned[0]).toEqual(filters[0]);
  });
});

describe('copyBitmapFilterInto', () => {
  it('copies fields from source to out', () => {
    const src = createBlurFilter({ blurX: 8, blurY: 2 });
    const out = createBlurFilter({ blurX: 1 });
    copyBitmapFilterInto(out, src);
    expect(out.blurX).toBe(8);
    expect(out.blurY).toBe(2);
  });

  it('is alias-safe when out === source', () => {
    const f = createBlurFilter({ blurX: 5 });
    copyBitmapFilterInto(f, f);
    expect(f.blurX).toBe(5);
  });

  it('throws on kind mismatch', () => {
    const a = createBlurFilter();
    const b = createDropShadowFilter();
    expect(() => copyBitmapFilterInto(a, b)).toThrow();
  });
});

describe('equalsBitmapFilter', () => {
  it('returns true for identical filters', () => {
    const f = createBlurFilter({ blurX: 4 });
    expect(equalsBitmapFilter(f, f)).toBe(true);
  });

  it('returns true for structurally equal filters', () => {
    expect(equalsBitmapFilter(createBlurFilter({ blurX: 4 }), createBlurFilter({ blurX: 4 }))).toBe(true);
  });

  it('returns false for different field values', () => {
    expect(equalsBitmapFilter(createBlurFilter({ blurX: 4 }), createBlurFilter({ blurX: 8 }))).toBe(false);
  });

  it('returns false for different kinds', () => {
    expect(equalsBitmapFilter(createBlurFilter(), createDropShadowFilter())).toBe(false);
  });

  it('compares array fields by value', () => {
    const m1 = new Array(20).fill(1);
    const m2 = new Array(20).fill(1);
    const m3 = new Array(20).fill(0);
    expect(equalsBitmapFilter(createColorMatrixFilter(m1), createColorMatrixFilter(m2))).toBe(true);
    expect(equalsBitmapFilter(createColorMatrixFilter(m1), createColorMatrixFilter(m3))).toBe(false);
  });
});

describe('equalsBitmapFilterList', () => {
  it('returns true for equal lists', () => {
    const a = [createBlurFilter({ blurX: 4 })];
    const b = [createBlurFilter({ blurX: 4 })];
    expect(equalsBitmapFilterList(a, b)).toBe(true);
  });

  it('returns false for lists of different lengths', () => {
    expect(equalsBitmapFilterList([createBlurFilter()], [])).toBe(false);
  });

  it('returns false when a filter differs', () => {
    expect(equalsBitmapFilterList([createBlurFilter({ blurX: 4 })], [createBlurFilter({ blurX: 8 })])).toBe(false);
  });
});

describe('normalizeBitmapFilter', () => {
  it('fills blur defaults', () => {
    const n = normalizeBitmapFilter(createBlurFilter()) as BlurFilter;
    expect(n.blurX).toBe(DEFAULT_FILTER_BLUR_X);
    expect(n.blurY).toBe(DEFAULT_FILTER_BLUR_Y);
  });

  it('fills drop shadow defaults', () => {
    const n = normalizeBitmapFilter(createDropShadowFilter()) as DropShadowFilter;
    expect(n.alpha).toBe(DEFAULT_FILTER_ALPHA);
    expect(n.angle).toBe(DEFAULT_FILTER_ANGLE);
    expect(n.color).toBe(DEFAULT_FILTER_COLOR);
    expect(n.distance).toBe(DEFAULT_FILTER_DISTANCE);
    expect(n.knockout).toBe(DEFAULT_FILTER_KNOCKOUT);
    expect(n.quality).toBe(DEFAULT_FILTER_QUALITY);
    expect(n.strength).toBe(DEFAULT_FILTER_STRENGTH);
  });

  it('preserves values already set', () => {
    const n = normalizeBitmapFilter(createBlurFilter({ blurX: 10 })) as BlurFilter;
    expect(n.blurX).toBe(10);
    expect(n.blurY).toBe(DEFAULT_FILTER_BLUR_Y);
  });

  it('is idempotent', () => {
    const f = createDropShadowFilter({ distance: 8 });
    const n1 = normalizeBitmapFilter(f);
    const n2 = normalizeBitmapFilter(n1);
    expect(equalsBitmapFilter(n1, n2)).toBe(true);
  });

  it('fills convolution defaults', () => {
    const n = normalizeBitmapFilter(
      createConvolutionFilter({ matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0], matrixX: 3, matrixY: 3 }),
    ) as ConvolutionFilter;
    expect(n.bias).toBe(0);
    expect(n.clamp).toBe(true);
    expect(n.preserveAlpha).toBe(true);
    expect(n.divisor).toBe(1);
  });

  it('passes unknown filter kinds through unchanged', () => {
    const custom = { kind: 'CustomFilter' };
    expect(normalizeBitmapFilter(custom)).toBe(custom);
  });
});
