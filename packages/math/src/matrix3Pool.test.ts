import type { Matrix3 } from '@flighthq/types';

import * as matrix3 from './matrix3.js';
import * as matrix3Pool from './matrix3Pool.js';

beforeEach(() => {
  matrix3Pool.clear();
});

test('get() returns a new Matrix3 when pool is empty', () => {
  const m: Matrix3 = matrix3Pool.get();
  expect(m).not.toBeNull();
});

test('getIdentity() returns a matrix set to identity', () => {
  const m = matrix3Pool.getIdentity();
  expect(matrix3.get(m, 0, 0)).toBe(1);
  expect(matrix3.get(m, 0, 1)).toBe(0);
  expect(matrix3.get(m, 0, 2)).toBe(0);
  expect(matrix3.get(m, 1, 0)).toBe(0);
  expect(matrix3.get(m, 1, 1)).toBe(1);
  expect(matrix3.get(m, 1, 2)).toBe(0);
  expect(matrix3.get(m, 2, 0)).toBe(0);
  expect(matrix3.get(m, 2, 1)).toBe(0);
  expect(matrix3.get(m, 2, 2)).toBe(1);
});

test('released matrices are reused by get()', () => {
  const m1 = matrix3Pool.get();
  matrix3Pool.release(m1);

  const m2 = matrix3Pool.get();
  expect(m2).toBe(m1); // same reference
});

test('getIdentity() resets released matrix to identity', () => {
  const m1 = matrix3Pool.get();
  m1.m[0] = 5;
  m1.m[2] = 10;

  matrix3Pool.release(m1);
  const m = matrix3Pool.getIdentity();

  expect(m).toBe(m1);
  expect(matrix3.get(m, 0, 0)).toBe(1);
  expect(matrix3.get(m, 0, 1)).toBe(0);
  expect(matrix3.get(m, 0, 2)).toBe(0);
  expect(matrix3.get(m, 1, 0)).toBe(0);
  expect(matrix3.get(m, 1, 1)).toBe(1);
  expect(matrix3.get(m, 1, 2)).toBe(0);
  expect(matrix3.get(m, 2, 0)).toBe(0);
  expect(matrix3.get(m, 2, 1)).toBe(0);
  expect(matrix3.get(m, 2, 2)).toBe(1);
});

test('clear() empties the pool', () => {
  const m = matrix3Pool.get();
  matrix3Pool.release(m);
  matrix3Pool.clear();

  const m2 = matrix3Pool.get();
  expect(m2).not.toBe(m); // pool was cleared, new instance
});

test('release() handles null safely', () => {
  expect(() => matrix3Pool.release(null as unknown as Matrix3)).not.toThrow();
});
