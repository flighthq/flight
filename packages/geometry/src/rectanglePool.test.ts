import type { Rectangle } from '@flighthq/types';

import { acquireEmptyRectangle, acquireRectangle, clearRectanglePool, releaseRectangle } from './rectanglePool';

beforeEach(() => {
  clearRectanglePool();
});

describe('acquireRectangle', () => {
  it('returns a new Rectangle when pool is empty', () => {
    const r: Rectangle = acquireRectangle();
    expect(r).not.toBeNull();
  });

  it('reuses released rectangles', () => {
    const r1 = acquireRectangle();
    releaseRectangle(r1);
    const r2 = acquireRectangle();
    expect(r2).toBe(r1);
  });
});

describe('acquireEmptyRectangle', () => {
  it('returns a rectangle with all properties set to 0', () => {
    const r = acquireEmptyRectangle();
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  it('resets a released rectangle to empty', () => {
    const r1 = acquireRectangle();
    r1.x = 5;
    r1.y = 10;
    r1.width = 50;
    r1.height = 100;
    releaseRectangle(r1);
    const r2 = acquireEmptyRectangle();
    expect(r2).toBe(r1);
    expect(r2.x).toBe(0);
    expect(r2.y).toBe(0);
    expect(r2.width).toBe(0);
    expect(r2.height).toBe(0);
  });
});

describe('releaseRectangle', () => {
  it('handles null safely', () => {
    expect(() => releaseRectangle(null as unknown as Rectangle)).not.toThrow();
  });
});

describe('clearRectanglePool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const r = acquireRectangle();
    releaseRectangle(r);
    clearRectanglePool();
    const r2 = acquireRectangle();
    expect(r2).not.toBe(r);
  });
});
