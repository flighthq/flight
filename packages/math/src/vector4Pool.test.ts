import type { Vector4 } from '@flighthq/types';

import * as vector4Pool from './vector4Pool.js';

beforeEach(() => {
  vector4Pool.clear();
});

test('get() returns a new Vector4 when pool is empty', () => {
  const v: Vector4 = vector4Pool.get();
  expect(v).not.toBeNull();
});

test('getIdentity() returns a matrix set to identity', () => {
  const v = vector4Pool.getEmpty();
  expect(v.x).toBe(0);
  expect(v.y).toBe(0);
  expect(v.z).toBe(0);
  expect(v.w).toBe(0);
});

test('released matrices are reused by get()', () => {
  const v1 = vector4Pool.get();
  vector4Pool.release(v1);

  const v2 = vector4Pool.get();
  expect(v2).toBe(v1); // same reference
});

test('getEmpty() resets released matrix to identity', () => {
  const v1 = vector4Pool.get();
  v1.x = 5;
  v1.y = 10;

  vector4Pool.release(v1);
  const v2 = vector4Pool.getEmpty();

  expect(v2).toBe(v1);
  expect(v2.x).toBe(0);
  expect(v2.y).toBe(0);
  expect(v2.z).toBe(0);
  expect(v2.w).toBe(0);
});

test('clear() empties the pool', () => {
  const m = vector4Pool.get();
  vector4Pool.release(m);
  vector4Pool.clear();

  const v2 = vector4Pool.get();
  expect(v2).not.toBe(m); // pool was cleared, new instance
});

test('release() handles null safely', () => {
  expect(() => vector4Pool.release(null as unknown as Vector4)).not.toThrow();
});
