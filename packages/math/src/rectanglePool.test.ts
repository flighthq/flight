import type { Rectangle } from '@flighthq/types';

import * as rectanglePool from './rectanglePool.js';

beforeEach(() => {
  rectanglePool.clear();
});

test('get() returns a new Rectangle when pool is empty', () => {
  const r: Rectangle = rectanglePool.get();
  expect(r).not.toBeNull();
  // expect(r).toBeInstanceOf(Rectangle);
});

test('getEmpty() returns a rectangle with all properties set to 0', () => {
  const r = rectanglePool.getEmpty();
  expect(r.x).toBe(0);
  expect(r.y).toBe(0);
  expect(r.width).toBe(0);
  expect(r.height).toBe(0);
});

test('released rectangles are reused by get()', () => {
  const r1 = rectanglePool.get();
  rectanglePool.release(r1);

  const r2 = rectanglePool.get();
  expect(r2).toBe(r1); // same reference reused
});

test('getEmpty() resets a released rectangle to empty', () => {
  const r1 = rectanglePool.get();
  r1.x = 5;
  r1.y = 10;
  r1.width = 50;
  r1.height = 100;

  rectanglePool.release(r1);
  const r2 = rectanglePool.getEmpty();

  expect(r2).toBe(r1);
  expect(r2.x).toBe(0);
  expect(r2.y).toBe(0);
  expect(r2.width).toBe(0);
  expect(r2.height).toBe(0);
});

test('clear() empties the pool', () => {
  const r = rectanglePool.get();
  rectanglePool.release(r);
  rectanglePool.clear();

  const r2 = rectanglePool.get();
  expect(r2).not.toBe(r); // pool was cleared, new instance
});

test('release() handles null safely', () => {
  expect(() => rectanglePool.release(null as unknown as Rectangle)).not.toThrow();
});
