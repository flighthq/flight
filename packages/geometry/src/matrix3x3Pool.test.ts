import type { Matrix3x3 } from '@flighthq/types';

import { matrix3x3 } from '@flighthq/geometry';
import * as matrix3x3Pool from './matrix3x3Pool';

beforeEach(() => {
  matrix3x3Pool.clear();
});

describe('get', () => {
  it('returns a new Matrix3x3 when pool is empty', () => {
    const m: Matrix3x3 = matrix3x3Pool.get();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = matrix3x3Pool.get();
    matrix3x3Pool.release(m1);
    const m2 = matrix3x3Pool.get();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = matrix3x3Pool.getIdentity();
    expect(matrix3x3.get(m, 0, 0)).toBe(1);
    expect(matrix3x3.get(m, 0, 1)).toBe(0);
    expect(matrix3x3.get(m, 0, 2)).toBe(0);
    expect(matrix3x3.get(m, 1, 0)).toBe(0);
    expect(matrix3x3.get(m, 1, 1)).toBe(1);
    expect(matrix3x3.get(m, 1, 2)).toBe(0);
    expect(matrix3x3.get(m, 2, 0)).toBe(0);
    expect(matrix3x3.get(m, 2, 1)).toBe(0);
    expect(matrix3x3.get(m, 2, 2)).toBe(1);
  });

  it('resets a released matrix to identity', () => {
    const m1 = matrix3x3Pool.get();
    m1.m[0] = 5;
    m1.m[2] = 10;
    matrix3x3Pool.release(m1);
    const m2 = matrix3x3Pool.getIdentity();
    expect(m2).toBe(m1);
    expect(matrix3x3.get(m2, 0, 0)).toBe(1);
    expect(matrix3x3.get(m2, 0, 2)).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => matrix3x3Pool.release(null as unknown as Matrix3x3)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = matrix3x3Pool.get();
    matrix3x3Pool.release(m);
    matrix3x3Pool.clear();
    const m2 = matrix3x3Pool.get();
    expect(m2).not.toBe(m);
  });
});
