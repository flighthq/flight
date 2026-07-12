import { getAdjustmentColorTransform, isColorLutAdjustment } from './colorLutAdjustment';
import { createHueSaturationAdjustment } from './hueSaturationAdjustment';
import { createInvertAdjustment } from './invertAdjustment';

describe('getAdjustmentColorTransform', () => {
  it('returns a LUT-tier adjustment its own transform', () => {
    const op = createHueSaturationAdjustment({ hue: 45 });
    expect(getAdjustmentColorTransform(op)).toBe(op.transform);
  });

  it('wraps a matrix-tier adjustment as an rgb→rgb transform at opaque alpha', () => {
    const op = createInvertAdjustment();
    const fn = getAdjustmentColorTransform(op);
    expect(fn).not.toBeNull();
    const out: [number, number, number] = [0, 0, 0];
    fn!(out, 1, 0, 0);
    // Full invert: red → cyan.
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });

  it('returns null for a non-pointwise operation', () => {
    expect(getAdjustmentColorTransform({ kind: 'BlurEffect' })).toBeNull();
  });
});

describe('isColorLutAdjustment', () => {
  it('is true for a LUT-tier adjustment', () => {
    expect(isColorLutAdjustment(createHueSaturationAdjustment())).toBe(true);
  });

  it('is false for a matrix-tier adjustment and for a plain effect', () => {
    expect(isColorLutAdjustment(createInvertAdjustment())).toBe(false);
    expect(isColorLutAdjustment({ kind: 'BlurEffect' })).toBe(false);
  });
});
