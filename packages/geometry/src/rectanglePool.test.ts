import type { Rectangle } from '@flighthq/types';

import { rectPoolClear, rectPoolGet, rectPoolGetEmpty, rectPoolRelease } from './rectanglePool';

beforeEach(() => {
  rectPoolClear();
});

describe('get', () => {
  it('returns a new Rectangle when pool is empty', () => {
    const r: Rectangle = rectPoolGet();
    expect(r).not.toBeNull();
  });

  it('reuses released rectangles', () => {
    const r1 = rectPoolGet();
    rectPoolRelease(r1);
    const r2 = rectPoolGet();
    expect(r2).toBe(r1);
  });
});

describe('getEmpty', () => {
  it('returns a rectangle with all properties set to 0', () => {
    const r = rectPoolGetEmpty();
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  it('resets a released rectangle to empty', () => {
    const r1 = rectPoolGet();
    r1.x = 5;
    r1.y = 10;
    r1.width = 50;
    r1.height = 100;
    rectPoolRelease(r1);
    const r2 = rectPoolGetEmpty();
    expect(r2).toBe(r1);
    expect(r2.x).toBe(0);
    expect(r2.y).toBe(0);
    expect(r2.width).toBe(0);
    expect(r2.height).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => rectPoolRelease(null as unknown as Rectangle)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const r = rectPoolGet();
    rectPoolRelease(r);
    rectPoolClear();
    const r2 = rectPoolGet();
    expect(r2).not.toBe(r);
  });
});
