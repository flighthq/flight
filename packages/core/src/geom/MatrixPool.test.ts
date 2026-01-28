import Matrix from './Matrix.js';
import MatrixPool from './MatrixPool.js';

describe('MatrixPool', () => {
  beforeEach(() => {
    MatrixPool.clear();
  });

  test('get() returns a new Matrix when pool is empty', () => {
    const m = MatrixPool.get();
    expect(m).toBeInstanceOf(Matrix);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const m = MatrixPool.getIdentity();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  test('released matrices are reused by get()', () => {
    const m1 = MatrixPool.get();
    MatrixPool.release(m1);

    const m2 = MatrixPool.get();
    expect(m2).toBe(m1); // same reference
  });

  test('getIdentity() resets released matrix to identity', () => {
    const m1 = MatrixPool.get();
    m1.a = 5;
    m1.tx = 10;

    MatrixPool.release(m1);
    const m2 = MatrixPool.getIdentity();

    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.b).toBe(0);
    expect(m2.c).toBe(0);
    expect(m2.d).toBe(1);
    expect(m2.tx).toBe(0);
    expect(m2.ty).toBe(0);
  });

  test('clear() empties the pool', () => {
    const m = MatrixPool.get();
    MatrixPool.release(m);
    MatrixPool.clear();

    const m2 = MatrixPool.get();
    expect(m2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => MatrixPool.release(null as any)).not.toThrow();
  });
});
