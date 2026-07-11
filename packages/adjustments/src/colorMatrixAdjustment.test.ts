import { getAdjustmentColorMatrix, isColorMatrixAdjustment } from './colorMatrixAdjustment';
import { createInvertAdjustment } from './invertAdjustment';

describe('getAdjustmentColorMatrix', () => {
  it('returns the matrix for a matrix-tier adjustment', () => {
    const adjustment = createInvertAdjustment();
    expect(getAdjustmentColorMatrix(adjustment)).toBe(adjustment.colorMatrix);
  });

  it('returns null for a spatial/composite effect (no colorMatrix)', () => {
    expect(getAdjustmentColorMatrix({ kind: 'BlurEffect' })).toBeNull();
  });

  it('returns null for a malformed colorMatrix', () => {
    expect(getAdjustmentColorMatrix({ kind: 'acme.Bad', colorMatrix: [1, 2, 3] } as never)).toBeNull();
  });
});

describe('isColorMatrixAdjustment', () => {
  it('is true for a matrix-tier adjustment and false for an effect', () => {
    expect(isColorMatrixAdjustment(createInvertAdjustment())).toBe(true);
    expect(isColorMatrixAdjustment({ kind: 'BlurEffect' })).toBe(false);
  });
});
