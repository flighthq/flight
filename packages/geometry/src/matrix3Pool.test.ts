import { getMatrix3Element } from '@flighthq/geometry';
import type { Matrix3 } from '@flighthq/types';

import { acquireIdentityMatrix3, acquireMatrix3, clearMatrix3Pool, releaseMatrix3 } from './matrix3Pool';

beforeEach(() => {
  clearMatrix3Pool();
});

describe('acquireMatrix3', () => {
  it('returns a new Matrix3 when pool is empty', () => {
    const m: Matrix3 = acquireMatrix3();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = acquireMatrix3();
    releaseMatrix3(m1);
    const m2 = acquireMatrix3();
    expect(m2).toBe(m1);
  });
});

describe('acquireIdentityMatrix3', () => {
  it('returns a matrix set to identity', () => {
    const m = acquireIdentityMatrix3();
    expect(getMatrix3Element(m, 0, 0)).toBe(1);
    expect(getMatrix3Element(m, 0, 1)).toBe(0);
    expect(getMatrix3Element(m, 0, 2)).toBe(0);
    expect(getMatrix3Element(m, 1, 0)).toBe(0);
    expect(getMatrix3Element(m, 1, 1)).toBe(1);
    expect(getMatrix3Element(m, 1, 2)).toBe(0);
    expect(getMatrix3Element(m, 2, 0)).toBe(0);
    expect(getMatrix3Element(m, 2, 1)).toBe(0);
    expect(getMatrix3Element(m, 2, 2)).toBe(1);
  });

  it('resets a released matrix to identity', () => {
    const m1 = acquireMatrix3();
    m1.m[0] = 5;
    m1.m[2] = 10;
    releaseMatrix3(m1);
    const m2 = acquireIdentityMatrix3();
    expect(m2).toBe(m1);
    expect(getMatrix3Element(m2, 0, 0)).toBe(1);
    expect(getMatrix3Element(m2, 0, 2)).toBe(0);
  });
});

describe('releaseMatrix3', () => {
  it('handles null safely', () => {
    expect(() => releaseMatrix3(null as unknown as Matrix3)).not.toThrow();
  });
});

describe('clearMatrix3Pool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = acquireMatrix3();
    releaseMatrix3(m);
    clearMatrix3Pool();
    const m2 = acquireMatrix3();
    expect(m2).not.toBe(m);
  });
});
