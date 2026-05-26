import type { Matrix3x2 } from '@flighthq/types';

import * as matrix3x2Pool from './matrix3x2Pool';

beforeEach(() => {
  matrix3x2Pool.clear();
});

describe('get', () => {
  it('returns a new Matrix3x2 when pool is empty', () => {
    const m: Matrix3x2 = matrix3x2Pool.get();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = matrix3x2Pool.get();
    matrix3x2Pool.release(m1);
    const m2 = matrix3x2Pool.get();
    expect(m2).toBe(m1);
  });
});

describe('getIdentity', () => {
  it('returns a matrix set to identity', () => {
    const m = matrix3x2Pool.getIdentity();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = matrix3x2Pool.get();
    m1.a = 5;
    m1.tx = 10;
    matrix3x2Pool.release(m1);
    const m2 = matrix3x2Pool.getIdentity();
    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.tx).toBe(0);
  });
});

describe('release', () => {
  it('handles null safely', () => {
    expect(() => matrix3x2Pool.release(null as unknown as Matrix3x2)).not.toThrow();
  });
});

describe('clear', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = matrix3x2Pool.get();
    matrix3x2Pool.release(m);
    matrix3x2Pool.clear();
    const m2 = matrix3x2Pool.get();
    expect(m2).not.toBe(m);
  });
});
