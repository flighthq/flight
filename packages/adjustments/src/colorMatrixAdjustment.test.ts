import {
  createColorMatrixAdjustment,
  getAdjustmentColorMatrix,
  initializeColorMatrixAdjustment,
  isColorMatrixAdjustment,
} from './colorMatrixAdjustment';
import { createIdentityColorMatrix } from './colorMatrixMath';
import { createInvertAdjustment } from './invertAdjustment';

describe('createColorMatrixAdjustment', () => {
  it('creates an authored generic matrix adjustment without a parallel transform payload', () => {
    const matrix = createIdentityColorMatrix();
    const adjustment = createColorMatrixAdjustment(matrix);
    expect(adjustment.kind).toBe('ColorMatrixAdjustment');
    expect(adjustment.colorMatrix).toEqual(matrix);
    expect(adjustment.colorMatrix).not.toBe(matrix);
  });
});

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
describe('initializeColorMatrixAdjustment', () => {
  it('is the construction initializer of createColorMatrixAdjustment', () => {
    expect(typeof initializeColorMatrixAdjustment).toBe('function');
  });
});
describe('isColorMatrixAdjustment', () => {
  it('is true for a matrix-tier adjustment and false for an effect', () => {
    expect(isColorMatrixAdjustment(createInvertAdjustment())).toBe(true);
    expect(isColorMatrixAdjustment({ kind: 'BlurEffect' })).toBe(false);
  });
});
