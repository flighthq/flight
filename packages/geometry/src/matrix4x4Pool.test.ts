import { matrix4x4 } from '@flighthq/geometry';
import type { Matrix4x4 } from '@flighthq/types';

import * as matrix4x4Pool from './matrix4x4Pool';

beforeEach(() => {
  matrix4x4Pool.clear();
});

describe('get', () => {
  it('returns a new Matrix4x4 when pool is empty', () => {
    const m: Matrix4x4 = matrix4x4Pool.get();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = matrix4x4Pool.get();
    matrix4x4Pool.release(m1);
    const m2 = matrix4x4Pool.get();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = matrix4x4Pool.getIdentity();
    expect(matrix4x4.get(m, 0, 0)).toBe(1);
    expect(matrix4x4.get(m, 0, 1)).toBe(0);
    expect(matrix4x4.get(m, 1, 1)).toBe(1);
    expect(matrix4x4.get(m, 2, 2)).toBe(1);
    expect(matrix4x4.get(m, 3, 3)).toBe(1);
    expect(matrix4x4.get(m, 0, 3)).toBe(0);
    expect(matrix4x4.get(m, 3, 0)).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = matrix4x4Pool.get();
    m1.m[0] = 5;
    m1.m[12] = 10;
    matrix4x4Pool.release(m1);
    const m2 = matrix4x4Pool.getIdentity();
    expect(m2).toBe(m1);
    expect(matrix4x4.get(m2, 0, 0)).toBe(1);
    expect(matrix4x4.get(m2, 3, 0)).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => matrix4x4Pool.release(null as unknown as Matrix4x4)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = matrix4x4Pool.get();
    matrix4x4Pool.release(m);
    matrix4x4Pool.clear();
    const m2 = matrix4x4Pool.get();
    expect(m2).not.toBe(m);
  });
});
