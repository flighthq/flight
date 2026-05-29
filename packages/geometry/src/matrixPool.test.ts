import type { Matrix } from '@flighthq/types';

import { acquireIdentityMatrix, acquireMatrix, clearMatrixPool, releaseMatrix } from './matrixPool';

beforeEach(() => {
  clearMatrixPool();
});

describe('acquireMatrix', () => {
  it('returns a new Matrix when pool is empty', () => {
    const m: Matrix = acquireMatrix();
    expect(m).not.toBeNull();
  });

  it('reuses released matrices', () => {
    const m1 = acquireMatrix();
    releaseMatrix(m1);
    const m2 = acquireMatrix();
    expect(m2).toBe(m1);
  });

  it('reuses released matrices in last-in-first-out order', () => {
    const m1 = acquireMatrix();
    const m2 = acquireMatrix();
    releaseMatrix(m1);
    releaseMatrix(m2);
    expect(acquireMatrix()).toBe(m2);
    expect(acquireMatrix()).toBe(m1);
  });
});

describe('acquireIdentityMatrix', () => {
  it('returns a matrix set to identity', () => {
    const m = acquireIdentityMatrix();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  it('resets a released matrix to identity', () => {
    const m1 = acquireMatrix();
    m1.a = 5;
    m1.tx = 10;
    releaseMatrix(m1);
    const m2 = acquireIdentityMatrix();
    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.tx).toBe(0);
  });
});

describe('releaseMatrix', () => {
  it('handles null safely', () => {
    expect(() => releaseMatrix(null as unknown as Matrix)).not.toThrow();
  });
});

describe('clearMatrixPool', () => {
  it('empties the pool so the next get allocates fresh', () => {
    const m = acquireMatrix();
    releaseMatrix(m);
    clearMatrixPool();
    const m2 = acquireMatrix();
    expect(m2).not.toBe(m);
  });
});
