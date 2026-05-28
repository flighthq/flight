import type { Matrix3x2 } from '@flighthq/types';

import { mat3x2PoolClear, mat3x2PoolGet, mat3x2PoolGetIdentity, mat3x2PoolRelease } from './matrix3x2Pool';

beforeEach(() => {
  mat3x2PoolClear();
});

describe('get', () => {
  it('returns a new Matrix3x2 when pool is empty', () => {
    const m: Matrix3x2 = mat3x2PoolGet();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = mat3x2PoolGet();
    mat3x2PoolRelease(m1);
    const m2 = mat3x2PoolGet();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = mat3x2PoolGetIdentity();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = mat3x2PoolGet();
    m1.a = 5;
    m1.tx = 10;
    mat3x2PoolRelease(m1);
    const m2 = mat3x2PoolGetIdentity();
    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.tx).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => mat3x2PoolRelease(null as unknown as Matrix3x2)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = mat3x2PoolGet();
    mat3x2PoolRelease(m);
    mat3x2PoolClear();
    const m2 = mat3x2PoolGet();
    expect(m2).not.toBe(m);
  });
});
