import { getMatrix4Element } from '@flighthq/geometry';
import type { Matrix4 } from '@flighthq/types';

import { acquireIdentityMatrix4, acquireMatrix4, clearMatrix4Pool, releaseMatrix4 } from './matrix4Pool';

beforeEach(() => {
  clearMatrix4Pool();
});

describe('acquireIdentityMatrix4', () => {
  it('returns a matrix set to identity', () => {
    const m = acquireIdentityMatrix4();
    expect(getMatrix4Element(m, 0, 0)).toBe(1);
    expect(getMatrix4Element(m, 0, 1)).toBe(0);
    expect(getMatrix4Element(m, 1, 1)).toBe(1);
    expect(getMatrix4Element(m, 2, 2)).toBe(1);
    expect(getMatrix4Element(m, 3, 3)).toBe(1);
    expect(getMatrix4Element(m, 0, 3)).toBe(0);
    expect(getMatrix4Element(m, 3, 0)).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = acquireMatrix4();
    m1.m[0] = 5;
    m1.m[12] = 10;
    releaseMatrix4(m1);
    const m2 = acquireIdentityMatrix4();
    expect(m2).toBe(m1);
    expect(getMatrix4Element(m2, 0, 0)).toBe(1);
    expect(getMatrix4Element(m2, 3, 0)).toBe(0);
  });
});

describe('acquireMatrix4', () => {
  it('returns a new Matrix4 when pool is empty', () => {
    const m: Matrix4 = acquireMatrix4();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = acquireMatrix4();
    releaseMatrix4(m1);
    const m2 = acquireMatrix4();
    expect(m2).toBe(m1);
  });

  it('reuses released matrices in last-in-first-out order', () => {
    const m1 = acquireMatrix4();
    const m2 = acquireMatrix4();
    releaseMatrix4(m1);
    releaseMatrix4(m2);
    expect(acquireMatrix4()).toBe(m2);
    expect(acquireMatrix4()).toBe(m1);
  });
});

describe('clearMatrix4Pool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = acquireMatrix4();
    releaseMatrix4(m);
    clearMatrix4Pool();
    const m2 = acquireMatrix4();
    expect(m2).not.toBe(m);
  });
});

describe('releaseMatrix4', () => {
  it('handles null safely', () => {
    expect(() => releaseMatrix4(null as unknown as Matrix4)).not.toThrow();
  });
});
