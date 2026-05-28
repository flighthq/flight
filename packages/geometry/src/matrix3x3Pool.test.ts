import { mat3x3Get } from '@flighthq/geometry';
import type { Matrix3x3 } from '@flighthq/types';

import { mat3x3PoolClear, mat3x3PoolGet, mat3x3PoolGetIdentity, mat3x3PoolRelease } from './matrix3x3Pool';

beforeEach(() => {
  mat3x3PoolClear();
});

describe('get', () => {
  it('returns a new Matrix3x3 when pool is empty', () => {
    const m: Matrix3x3 = mat3x3PoolGet();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = mat3x3PoolGet();
    mat3x3PoolRelease(m1);
    const m2 = mat3x3PoolGet();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = mat3x3PoolGetIdentity();
    expect(mat3x3Get(m, 0, 0)).toBe(1);
    expect(mat3x3Get(m, 0, 1)).toBe(0);
    expect(mat3x3Get(m, 0, 2)).toBe(0);
    expect(mat3x3Get(m, 1, 0)).toBe(0);
    expect(mat3x3Get(m, 1, 1)).toBe(1);
    expect(mat3x3Get(m, 1, 2)).toBe(0);
    expect(mat3x3Get(m, 2, 0)).toBe(0);
    expect(mat3x3Get(m, 2, 1)).toBe(0);
    expect(mat3x3Get(m, 2, 2)).toBe(1);
  });

  it('resets a released matrix to identity', () => {
    const m1 = mat3x3PoolGet();
    m1.m[0] = 5;
    m1.m[2] = 10;
    mat3x3PoolRelease(m1);
    const m2 = mat3x3PoolGetIdentity();
    expect(m2).toBe(m1);
    expect(mat3x3Get(m2, 0, 0)).toBe(1);
    expect(mat3x3Get(m2, 0, 2)).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => mat3x3PoolRelease(null as unknown as Matrix3x3)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = mat3x3PoolGet();
    mat3x3PoolRelease(m);
    mat3x3PoolClear();
    const m2 = mat3x3PoolGet();
    expect(m2).not.toBe(m);
  });
});
