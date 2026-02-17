import type { Matrix4x4 } from '@flighthq/types';

import * as matrix4x4 from './matrix4x4.js';
import * as matrix4x4Pool from './matrix4x4Pool.js';

beforeEach(() => {
  matrix4x4Pool.clear();
});

test('get() returns a new Matrix4x4 when pool is empty', () => {
  const m: Matrix4x4 = matrix4x4Pool.get();
  expect(m).not.toBeNull();
});

test('getIdentity() returns a matrix set to identity', () => {
  const m = matrix4x4Pool.getIdentity();
  expect(matrix4x4.get(m, 0, 0)).toBe(1);
  expect(matrix4x4.get(m, 0, 1)).toBe(0);
  expect(matrix4x4.get(m, 0, 2)).toBe(0);
  expect(matrix4x4.get(m, 0, 3)).toBe(0);
  expect(matrix4x4.get(m, 1, 0)).toBe(0);
  expect(matrix4x4.get(m, 1, 1)).toBe(1);
  expect(matrix4x4.get(m, 1, 2)).toBe(0);
  expect(matrix4x4.get(m, 1, 3)).toBe(0);
  expect(matrix4x4.get(m, 2, 0)).toBe(0);
  expect(matrix4x4.get(m, 2, 1)).toBe(0);
  expect(matrix4x4.get(m, 2, 2)).toBe(1);
  expect(matrix4x4.get(m, 2, 3)).toBe(0);
  expect(matrix4x4.get(m, 3, 0)).toBe(0);
  expect(matrix4x4.get(m, 3, 1)).toBe(0);
  expect(matrix4x4.get(m, 3, 2)).toBe(0);
  expect(matrix4x4.get(m, 3, 3)).toBe(1);
});

test('released matrices are reused by get()', () => {
  const m1 = matrix4x4Pool.get();
  matrix4x4Pool.release(m1);

  const m2 = matrix4x4Pool.get();
  expect(m2).toBe(m1); // same reference
});

test('getIdentity() resets released matrix to identity', () => {
  const m1 = matrix4x4Pool.get();
  m1.m[0] = 5;
  m1.m[12] = 10;

  matrix4x4Pool.release(m1);
  const m2 = matrix4x4Pool.getIdentity();

  expect(m2).toBe(m1);
  expect(matrix4x4.get(m2, 0, 0)).toBe(1);
  expect(matrix4x4.get(m2, 0, 1)).toBe(0);
  expect(matrix4x4.get(m2, 0, 2)).toBe(0);
  expect(matrix4x4.get(m2, 0, 3)).toBe(0);
  expect(matrix4x4.get(m2, 1, 0)).toBe(0);
  expect(matrix4x4.get(m2, 1, 1)).toBe(1);
  expect(matrix4x4.get(m2, 1, 2)).toBe(0);
  expect(matrix4x4.get(m2, 1, 3)).toBe(0);
  expect(matrix4x4.get(m2, 2, 0)).toBe(0);
  expect(matrix4x4.get(m2, 2, 1)).toBe(0);
  expect(matrix4x4.get(m2, 2, 2)).toBe(1);
  expect(matrix4x4.get(m2, 2, 3)).toBe(0);
  expect(matrix4x4.get(m2, 3, 0)).toBe(0);
  expect(matrix4x4.get(m2, 3, 1)).toBe(0);
  expect(matrix4x4.get(m2, 3, 2)).toBe(0);
  expect(matrix4x4.get(m2, 3, 3)).toBe(1);
});

test('clear() empties the pool', () => {
  const m = matrix4x4Pool.get();
  matrix4x4Pool.release(m);
  matrix4x4Pool.clear();

  const m2 = matrix4x4Pool.get();
  expect(m2).not.toBe(m); // pool was cleared, new instance
});

test('release() handles null safely', () => {
  expect(() => matrix4x4Pool.release(null as unknown as Matrix4x4)).not.toThrow();
});
