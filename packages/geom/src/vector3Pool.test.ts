import type { Vector3 } from '@flighthq/types';

import * as vector3Pool from './vector3Pool.js';

beforeEach(() => {
  vector3Pool.clear();
});

test('get() returns a new Vector3 when pool is empty', () => {
  const v: Vector3 = vector3Pool.get();
  expect(v).not.toBeNull();
});

test('getIdentity() returns a matrix set to identity', () => {
  const v = vector3Pool.getEmpty();
  expect(v.x).toBe(0);
  expect(v.y).toBe(0);
  expect(v.z).toBe(0);
});

test('released matrices are reused by get()', () => {
  const v1 = vector3Pool.get();
  vector3Pool.release(v1);

  const v2 = vector3Pool.get();
  expect(v2).toBe(v1); // same reference
});

test('getEmpty() resets released matrix to identity', () => {
  const v1 = vector3Pool.get();
  v1.x = 5;
  v1.y = 10;

  vector3Pool.release(v1);
  const v2 = vector3Pool.getEmpty();

  expect(v2).toBe(v1);
  expect(v2.x).toBe(0);
  expect(v2.y).toBe(0);
  expect(v2.z).toBe(0);
});

test('clear() empties the pool', () => {
  const m = vector3Pool.get();
  vector3Pool.release(m);
  vector3Pool.clear();

  const v2 = vector3Pool.get();
  expect(v2).not.toBe(m); // pool was cleared, new instance
});

test('release() handles null safely', () => {
  expect(() => vector3Pool.release(null as unknown as Vector3)).not.toThrow();
});
