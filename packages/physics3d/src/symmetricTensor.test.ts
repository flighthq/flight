import { describe, expect, it } from 'vitest';

import {
  applySymmetricTensor,
  inverseSymmetricTensor,
  rotateSymmetricTensor,
  translateSymmetricTensor,
  TENSOR_XX,
  TENSOR_XY,
  TENSOR_XZ,
  TENSOR_YY,
  TENSOR_YZ,
  TENSOR_ZZ,
} from './symmetricTensor';

describe('applySymmetricTensor', () => {
  it('multiplies a diagonal tensor componentwise', () => {
    const out = [0, 0, 0];
    applySymmetricTensor([2, 3, 4, 0, 0, 0], 1, 1, 1, out);
    expect(out).toEqual([2, 3, 4]);
  });

  it('mixes components through the off-diagonal terms', () => {
    const out = [0, 0, 0];
    applySymmetricTensor([1, 1, 1, 2, 0, 0], 1, 0, 0, out);
    expect(out).toEqual([1, 2, 0]);
  });

  it('is symmetric: the xy term feeds x from y as it feeds y from x', () => {
    const fromX = [0, 0, 0];
    const fromY = [0, 0, 0];
    applySymmetricTensor([1, 1, 1, 2, 0, 0], 1, 0, 0, fromX);
    applySymmetricTensor([1, 1, 1, 2, 0, 0], 0, 1, 0, fromY);
    expect(fromX[1]).toBe(fromY[0]);
  });
});

describe('inverseSymmetricTensor', () => {
  it('inverts a diagonal tensor by reciprocal', () => {
    const out = [0, 0, 0, 0, 0, 0];
    expect(inverseSymmetricTensor([2, 4, 8, 0, 0, 0], out)).toBe(true);
    expect(out[TENSOR_XX]).toBeCloseTo(0.5, 12);
    expect(out[TENSOR_YY]).toBeCloseTo(0.25, 12);
    expect(out[TENSOR_ZZ]).toBeCloseTo(0.125, 12);
  });

  it('round-trips a general tensor back to the identity', () => {
    const tensor = [4, 5, 6, 1, 2, 3];
    const inverse = [0, 0, 0, 0, 0, 0];
    expect(inverseSymmetricTensor(tensor, inverse)).toBe(true);

    // tensor * inverse applied to each basis vector must return that basis vector.
    const out = [0, 0, 0];
    applySymmetricTensor(inverse, tensor[TENSOR_XX], tensor[TENSOR_XY], tensor[TENSOR_XZ], out);
    expect(out[0]).toBeCloseTo(1, 10);
    expect(out[1]).toBeCloseTo(0, 10);
    expect(out[2]).toBeCloseTo(0, 10);
  });

  it('reports a singular tensor and writes zeros, the infinite-inertia sentinel', () => {
    const out = [9, 9, 9, 9, 9, 9];
    expect(inverseSymmetricTensor([0, 0, 0, 0, 0, 0], out)).toBe(false);
    expect(out).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('reports a rank-deficient tensor as singular rather than inverting it', () => {
    const out = [0, 0, 0, 0, 0, 0];
    // Two equal rows: determinant is exactly zero.
    expect(inverseSymmetricTensor([1, 1, 0, 1, 0, 0], out)).toBe(false);
  });

  it('is safe when out aliases the input', () => {
    const tensor = [2, 4, 8, 0, 0, 0];
    expect(inverseSymmetricTensor(tensor, tensor)).toBe(true);
    expect(tensor[TENSOR_XX]).toBeCloseTo(0.5, 12);
    expect(tensor[TENSOR_ZZ]).toBeCloseTo(0.125, 12);
  });
});

describe('rotateSymmetricTensor', () => {
  it('leaves a tensor unchanged under the identity quaternion', () => {
    const out = [0, 0, 0, 0, 0, 0];
    rotateSymmetricTensor([1, 2, 3, 0.5, 0.25, 0.125], 0, 0, 0, 1, out);
    expect(out[TENSOR_XX]).toBeCloseTo(1, 12);
    expect(out[TENSOR_YY]).toBeCloseTo(2, 12);
    expect(out[TENSOR_ZZ]).toBeCloseTo(3, 12);
    expect(out[TENSOR_XY]).toBeCloseTo(0.5, 12);
    expect(out[TENSOR_XZ]).toBeCloseTo(0.25, 12);
    expect(out[TENSOR_YZ]).toBeCloseTo(0.125, 12);
  });

  it('swaps the x and y moments under a quarter turn about z', () => {
    const half = Math.SQRT1_2;
    const out = [0, 0, 0, 0, 0, 0];
    rotateSymmetricTensor([1, 5, 9, 0, 0, 0], 0, 0, half, half, out);
    expect(out[TENSOR_XX]).toBeCloseTo(5, 10);
    expect(out[TENSOR_YY]).toBeCloseTo(1, 10);
    expect(out[TENSOR_ZZ]).toBeCloseTo(9, 10);
  });

  it('leaves an isotropic tensor unchanged under any rotation', () => {
    const out = [0, 0, 0, 0, 0, 0];
    const n = 1 / Math.sqrt(3);
    const angle = 0.7;
    const s = Math.sin(angle / 2);
    rotateSymmetricTensor([4, 4, 4, 0, 0, 0], n * s, n * s, n * s, Math.cos(angle / 2), out);
    expect(out[TENSOR_XX]).toBeCloseTo(4, 10);
    expect(out[TENSOR_YY]).toBeCloseTo(4, 10);
    expect(out[TENSOR_ZZ]).toBeCloseTo(4, 10);
    expect(out[TENSOR_XY]).toBeCloseTo(0, 10);
  });

  it('preserves the trace, which rotation cannot change', () => {
    const out = [0, 0, 0, 0, 0, 0];
    const angle = 1.1;
    rotateSymmetricTensor([2, 5, 11, 0.3, -0.4, 0.6], Math.sin(angle / 2), 0, 0, Math.cos(angle / 2), out);
    expect(out[TENSOR_XX] + out[TENSOR_YY] + out[TENSOR_ZZ]).toBeCloseTo(2 + 5 + 11, 10);
  });

  it('is safe when out aliases the input', () => {
    const half = Math.SQRT1_2;
    const tensor = [1, 5, 9, 0, 0, 0];
    rotateSymmetricTensor(tensor, 0, 0, half, half, tensor);
    expect(tensor[TENSOR_XX]).toBeCloseTo(5, 10);
    expect(tensor[TENSOR_YY]).toBeCloseTo(1, 10);
  });
});

describe('translateSymmetricTensor', () => {
  it('adds the point-mass term along the offset axes', () => {
    const out = [0, 0, 0, 0, 0, 0];
    translateSymmetricTensor([0, 0, 0, 0, 0, 0], 2, 0, 3, 0, out);
    // Offset purely in y: xx and zz gain mass * dy^2, yy is untouched.
    expect(out[TENSOR_XX]).toBeCloseTo(18, 12);
    expect(out[TENSOR_YY]).toBeCloseTo(0, 12);
    expect(out[TENSOR_ZZ]).toBeCloseTo(18, 12);
  });

  it('produces negative off-diagonal terms for a diagonal offset', () => {
    const out = [0, 0, 0, 0, 0, 0];
    translateSymmetricTensor([0, 0, 0, 0, 0, 0], 1, 2, 3, 0, out);
    expect(out[TENSOR_XY]).toBeCloseTo(-6, 12);
  });

  it('is even in the offset — negating it gives the same tensor', () => {
    const positive = [0, 0, 0, 0, 0, 0];
    const negative = [0, 0, 0, 0, 0, 0];
    translateSymmetricTensor([1, 1, 1, 0, 0, 0], 3, 1, 2, 3, positive);
    translateSymmetricTensor([1, 1, 1, 0, 0, 0], 3, -1, -2, -3, negative);
    expect(negative[TENSOR_XX]).toBeCloseTo(positive[TENSOR_XX], 12);
    expect(negative[TENSOR_XY]).toBeCloseTo(positive[TENSOR_XY], 12);
  });

  it('is a no-op at zero offset', () => {
    const out = [0, 0, 0, 0, 0, 0];
    translateSymmetricTensor([1, 2, 3, 4, 5, 6], 7, 0, 0, 0, out);
    expect(out).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('is safe when out aliases the input', () => {
    const tensor = [1, 1, 1, 0, 0, 0];
    translateSymmetricTensor(tensor, 2, 0, 3, 0, tensor);
    expect(tensor[TENSOR_XX]).toBeCloseTo(19, 12);
    expect(tensor[TENSOR_YY]).toBeCloseTo(1, 12);
  });
});
