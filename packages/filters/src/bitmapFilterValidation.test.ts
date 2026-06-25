import {
  clampFilterQuality,
  clampFilterStrength,
  isValidBitmapFilter,
  isValidBitmapFilterList,
} from './bitmapFilterValidation';

describe('clampFilterQuality', () => {
  it('returns 1 for values below 1', () => {
    expect(clampFilterQuality(0)).toBe(1);
    expect(clampFilterQuality(-5)).toBe(1);
  });

  it('returns 15 for values above 15', () => {
    expect(clampFilterQuality(20)).toBe(15);
  });

  it('rounds to the nearest integer', () => {
    expect(clampFilterQuality(2.7)).toBe(3);
    expect(clampFilterQuality(1.2)).toBe(1);
  });

  it('passes valid values through', () => {
    expect(clampFilterQuality(3)).toBe(3);
  });
});

describe('clampFilterStrength', () => {
  it('returns 0 for negative values', () => {
    expect(clampFilterStrength(-1)).toBe(0);
  });

  it('returns 255 for values above 255', () => {
    expect(clampFilterStrength(300)).toBe(255);
  });

  it('passes valid values through', () => {
    expect(clampFilterStrength(128)).toBe(128);
  });
});

describe('isValidBitmapFilter', () => {
  it('returns false for null', () => {
    expect(isValidBitmapFilter(null)).toBe(false);
  });

  it('returns false for a primitive', () => {
    expect(isValidBitmapFilter('blur')).toBe(false);
  });

  it('returns false for an unknown kind', () => {
    expect(isValidBitmapFilter({ kind: 'CustomFilter' })).toBe(false);
  });

  it('returns true for a valid BlurFilter', () => {
    expect(isValidBitmapFilter({ kind: 'BlurFilter' })).toBe(true);
  });

  it('returns true for a valid DropShadowFilter', () => {
    expect(isValidBitmapFilter({ kind: 'DropShadowFilter' })).toBe(true);
  });

  it('returns true for a valid ColorMatrixFilter with correct length', () => {
    expect(isValidBitmapFilter({ kind: 'ColorMatrixFilter', matrix: new Array(20).fill(0) })).toBe(true);
  });

  it('returns false for a ColorMatrixFilter with wrong matrix length', () => {
    expect(isValidBitmapFilter({ kind: 'ColorMatrixFilter', matrix: new Array(19).fill(0) })).toBe(false);
  });

  it('returns true for a valid ConvolutionFilter', () => {
    expect(
      isValidBitmapFilter({ kind: 'ConvolutionFilter', matrix: new Array(9).fill(0), matrixX: 3, matrixY: 3 }),
    ).toBe(true);
  });

  it('returns false for a ConvolutionFilter with mismatched matrix size', () => {
    expect(
      isValidBitmapFilter({ kind: 'ConvolutionFilter', matrix: new Array(9).fill(0), matrixX: 3, matrixY: 4 }),
    ).toBe(false);
  });

  it('returns true for a valid GradientGlowFilter', () => {
    expect(
      isValidBitmapFilter({
        kind: 'GradientGlowFilter',
        alphas: [1],
        colors: [0xff0000ff],
        ratios: [128],
      }),
    ).toBe(true);
  });

  it('returns false for a GradientGlowFilter missing arrays', () => {
    expect(isValidBitmapFilter({ kind: 'GradientGlowFilter' })).toBe(false);
  });
});

describe('isValidBitmapFilterList', () => {
  it('returns true for an empty array', () => {
    expect(isValidBitmapFilterList([])).toBe(true);
  });

  it('returns true for a list of valid filters', () => {
    expect(isValidBitmapFilterList([{ kind: 'BlurFilter' }, { kind: 'DropShadowFilter' }])).toBe(true);
  });

  it('returns false when any element is invalid', () => {
    expect(isValidBitmapFilterList([{ kind: 'BlurFilter' }, { kind: 'CustomFilter' }])).toBe(false);
  });

  it('returns false for a non-array', () => {
    expect(isValidBitmapFilterList(null)).toBe(false);
    expect(isValidBitmapFilterList({ kind: 'BlurFilter' })).toBe(false);
    expect(isValidBitmapFilterList('not an array')).toBe(false);
  });
});
