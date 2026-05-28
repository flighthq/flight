import { mat4x4Get } from '@flighthq/geometry';
import type { Matrix4x4 } from '@flighthq/types';

import { mat4x4PoolClear, mat4x4PoolGet, mat4x4PoolGetIdentity, mat4x4PoolRelease } from './matrix4x4Pool';

beforeEach(() => {
  mat4x4PoolClear();
});

describe('get', () => {
  it('returns a new Matrix4x4 when pool is empty', () => {
    const m: Matrix4x4 = mat4x4PoolGet();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = mat4x4PoolGet();
    mat4x4PoolRelease(m1);
    const m2 = mat4x4PoolGet();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = mat4x4PoolGetIdentity();
    expect(mat4x4Get(m, 0, 0)).toBe(1);
    expect(mat4x4Get(m, 0, 1)).toBe(0);
    expect(mat4x4Get(m, 1, 1)).toBe(1);
    expect(mat4x4Get(m, 2, 2)).toBe(1);
    expect(mat4x4Get(m, 3, 3)).toBe(1);
    expect(mat4x4Get(m, 0, 3)).toBe(0);
    expect(mat4x4Get(m, 3, 0)).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = mat4x4PoolGet();
    m1.m[0] = 5;
    m1.m[12] = 10;
    mat4x4PoolRelease(m1);
    const m2 = mat4x4PoolGetIdentity();
    expect(m2).toBe(m1);
    expect(mat4x4Get(m2, 0, 0)).toBe(1);
    expect(mat4x4Get(m2, 3, 0)).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => mat4x4PoolRelease(null as unknown as Matrix4x4)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = mat4x4PoolGet();
    mat4x4PoolRelease(m);
    mat4x4PoolClear();
    const m2 = mat4x4PoolGet();
    expect(m2).not.toBe(m);
  });
});
