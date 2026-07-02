import { createMatrix } from '@flighthq/geometry';

import { createVelocityField, ensureVelocitySample } from './velocityField';
import { getVelocitySampleAt } from './velocitySample';

describe('getVelocitySampleAt', () => {
  it('returns zero when the sample has no previousWorldTransform', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    const identity = createMatrix();
    const out = { x: 99, y: 99 };
    getVelocitySampleAt(sample, identity, 0, 0, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('returns translation delta at the origin when transform is translation-only', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 3, 4);
    const current = createMatrix(1, 0, 0, 1, 8, 9);
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 0, 0, out);
    expect(out).toEqual({ x: 5, y: 5 });
  });

  it('computes affine reprojection for a non-origin point', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.previousWorldTransform = createMatrix();
    const current = createMatrix(1, 0, 0, 1, 2, 3);
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 1, 0, out);
    expect(out).toEqual({ x: 2, y: 3 });
  });

  it('computes correct velocity for a rotating transform at a non-origin point', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.previousWorldTransform = createMatrix();
    const rotated90 = createMatrix(0, 1, -1, 0, 0, 0);
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, rotated90, 1, 0, out);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(1);
  });

  it('is alias-safe when out references a different object (basic alias check)', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.previousWorldTransform = createMatrix(1, 0, 0, 1, 1, 2);
    const current = createMatrix(1, 0, 0, 1, 4, 6);
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(sample, current, 0, 0, out);
    expect(out).toEqual({ x: 3, y: 4 });
  });
});
