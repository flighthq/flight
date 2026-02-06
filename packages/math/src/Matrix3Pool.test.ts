import Matrix3 from './Matrix3.js';
import Matrix3Pool from './Matrix3Pool.js';

describe('Matrix3Pool', () => {
  beforeEach(() => {
    Matrix3Pool.clear();
  });

  test('get() returns a new Matrix3 when pool is empty', () => {
    const m = Matrix3Pool.get();
    expect(m).toBeInstanceOf(Matrix3);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const m = Matrix3Pool.getIdentity();
    expect(m.m00).toBe(1);
    expect(m.m01).toBe(0);
    expect(m.m02).toBe(0);
    expect(m.m10).toBe(0);
    expect(m.m11).toBe(1);
    expect(m.m12).toBe(0);
    expect(m.m20).toBe(0);
    expect(m.m21).toBe(0);
    expect(m.m22).toBe(1);

    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  test('released matrices are reused by get()', () => {
    const m1 = Matrix3Pool.get();
    Matrix3Pool.release(m1);

    const m2 = Matrix3Pool.get();
    expect(m2).toBe(m1); // same reference
  });

  test('getIdentity() resets released matrix to identity', () => {
    const m1 = Matrix3Pool.get();
    m1.a = 5;
    m1.tx = 10;

    Matrix3Pool.release(m1);
    const m2 = Matrix3Pool.getIdentity();

    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.b).toBe(0);
    expect(m2.c).toBe(0);
    expect(m2.d).toBe(1);
    expect(m2.tx).toBe(0);
    expect(m2.ty).toBe(0);

    expect(m2.m00).toBe(1);
    expect(m2.m01).toBe(0);
    expect(m2.m02).toBe(0);
    expect(m2.m10).toBe(0);
    expect(m2.m11).toBe(1);
    expect(m2.m12).toBe(0);
    expect(m2.m20).toBe(0);
    expect(m2.m21).toBe(0);
    expect(m2.m22).toBe(1);
  });

  test('clear() empties the pool', () => {
    const m = Matrix3Pool.get();
    Matrix3Pool.release(m);
    Matrix3Pool.clear();

    const m2 = Matrix3Pool.get();
    expect(m2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => Matrix3Pool.release(null as unknown as Matrix3)).not.toThrow();
  });
});
