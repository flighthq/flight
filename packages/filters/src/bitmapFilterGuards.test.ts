import type { ColorMatrixFilter, ConvolutionFilter, GradientBevelFilter, GradientGlowFilter } from '@flighthq/types';

import {
  isBevelFilter,
  isBitmapFilter,
  isBlurFilter,
  isColorMatrixFilter,
  isConvolutionFilter,
  isDisplacementMapFilter,
  isDropShadowFilter,
  isGradientBevelFilter,
  isGradientGlowFilter,
  isInnerGlowFilter,
  isInnerShadowFilter,
  isMedianFilter,
  isOuterGlowFilter,
  isPixelateFilter,
  isSharpenFilter,
} from './bitmapFilterGuards';

describe('isBevelFilter', () => {
  it('returns true for a bevel filter', () => {
    expect(isBevelFilter({ kind: 'BevelFilter' })).toBe(true);
  });

  it('returns false for a different filter', () => {
    expect(isBevelFilter({ kind: 'BlurFilter' })).toBe(false);
  });
});

describe('isBitmapFilter', () => {
  it('returns false for null', () => {
    expect(isBitmapFilter(null)).toBe(false);
  });

  it('returns false for a primitive', () => {
    expect(isBitmapFilter(42)).toBe(false);
  });

  it('returns false for an object without a string kind', () => {
    expect(isBitmapFilter({ kind: 42 })).toBe(false);
  });

  it('returns true for any object with a string kind', () => {
    expect(isBitmapFilter({ kind: 'BlurFilter' })).toBe(true);
  });
});

describe('isBlurFilter', () => {
  it('returns false for a different filter', () => {
    expect(isBlurFilter({ kind: 'DropShadowFilter' })).toBe(false);
  });

  it('returns true for a blur filter', () => {
    expect(isBlurFilter({ kind: 'BlurFilter' })).toBe(true);
  });
});

describe('isColorMatrixFilter', () => {
  it('returns false for a different filter', () => {
    expect(isColorMatrixFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a color matrix filter', () => {
    const f: ColorMatrixFilter = { kind: 'ColorMatrixFilter', matrix: [] };
    expect(isColorMatrixFilter(f)).toBe(true);
  });
});

describe('isConvolutionFilter', () => {
  it('returns false for a different filter', () => {
    expect(isConvolutionFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a convolution filter', () => {
    const f: ConvolutionFilter = { kind: 'ConvolutionFilter', matrix: [], matrixX: 3, matrixY: 3 };
    expect(isConvolutionFilter(f)).toBe(true);
  });
});

describe('isDisplacementMapFilter', () => {
  it('returns false for a different filter', () => {
    expect(isDisplacementMapFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a displacement map filter', () => {
    expect(isDisplacementMapFilter({ kind: 'DisplacementMapFilter' })).toBe(true);
  });
});

describe('isDropShadowFilter', () => {
  it('returns false for a different filter', () => {
    expect(isDropShadowFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a drop shadow filter', () => {
    expect(isDropShadowFilter({ kind: 'DropShadowFilter' })).toBe(true);
  });
});

describe('isGradientBevelFilter', () => {
  it('returns false for a different filter', () => {
    expect(isGradientBevelFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a gradient bevel filter', () => {
    const f: GradientBevelFilter = { kind: 'GradientBevelFilter', alphas: [], colors: [], ratios: [] };
    expect(isGradientBevelFilter(f)).toBe(true);
  });
});

describe('isGradientGlowFilter', () => {
  it('returns false for a different filter', () => {
    expect(isGradientGlowFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a gradient glow filter', () => {
    const f: GradientGlowFilter = { kind: 'GradientGlowFilter', alphas: [], colors: [], ratios: [] };
    expect(isGradientGlowFilter(f)).toBe(true);
  });
});

describe('isInnerGlowFilter', () => {
  it('returns false for a different filter', () => {
    expect(isInnerGlowFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for an inner glow filter', () => {
    expect(isInnerGlowFilter({ kind: 'InnerGlowFilter' })).toBe(true);
  });
});

describe('isInnerShadowFilter', () => {
  it('returns false for a different filter', () => {
    expect(isInnerShadowFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for an inner shadow filter', () => {
    expect(isInnerShadowFilter({ kind: 'InnerShadowFilter' })).toBe(true);
  });
});

describe('isMedianFilter', () => {
  it('returns false for a different filter', () => {
    expect(isMedianFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a median filter', () => {
    expect(isMedianFilter({ kind: 'MedianFilter' })).toBe(true);
  });
});

describe('isOuterGlowFilter', () => {
  it('returns false for a different filter', () => {
    expect(isOuterGlowFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for an outer glow filter', () => {
    expect(isOuterGlowFilter({ kind: 'OuterGlowFilter' })).toBe(true);
  });
});

describe('isPixelateFilter', () => {
  it('returns false for a different filter', () => {
    expect(isPixelateFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a pixelate filter', () => {
    expect(isPixelateFilter({ kind: 'PixelateFilter' })).toBe(true);
  });
});

describe('isSharpenFilter', () => {
  it('returns false for a different filter', () => {
    expect(isSharpenFilter({ kind: 'BlurFilter' })).toBe(false);
  });

  it('returns true for a sharpen filter', () => {
    expect(isSharpenFilter({ kind: 'SharpenFilter' })).toBe(true);
  });
});
