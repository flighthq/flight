import Matrix4 from './Matrix4.js';
import Matrix4Pool from './Matrix4Pool.js';

describe('Matrix4Pool', () => {
  beforeEach(() => {
    Matrix4Pool.clear();
  });

  test('get() returns a new Matrix4 when pool is empty', () => {
    const m = Matrix4Pool.get();
    expect(m).toBeInstanceOf(Matrix4);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const m = Matrix4Pool.getIdentity();
    expect(m.m00).toBe(1);
    expect(m.m01).toBe(0);
    expect(m.m02).toBe(0);
    expect(m.m03).toBe(0);
    expect(m.m10).toBe(0);
    expect(m.m11).toBe(1);
    expect(m.m12).toBe(0);
    expect(m.m13).toBe(0);
    expect(m.m20).toBe(0);
    expect(m.m21).toBe(0);
    expect(m.m22).toBe(1);
    expect(m.m23).toBe(0);
    expect(m.m30).toBe(0);
    expect(m.m31).toBe(0);
    expect(m.m32).toBe(0);
    expect(m.m33).toBe(1);
  });

  test('released matrices are reused by get()', () => {
    const m1 = Matrix4Pool.get();
    Matrix4Pool.release(m1);

    const m2 = Matrix4Pool.get();
    expect(m2).toBe(m1); // same reference
  });

  test('getIdentity() resets released matrix to identity', () => {
    const m1 = Matrix4Pool.get();
    m1.m[0] = 5;
    m1.m[12] = 10;

    Matrix4Pool.release(m1);
    const m2 = Matrix4Pool.getIdentity();

    expect(m2).toBe(m1);
    expect(m2.m00).toBe(1);
    expect(m2.m01).toBe(0);
    expect(m2.m02).toBe(0);
    expect(m2.m03).toBe(0);
    expect(m2.m10).toBe(0);
    expect(m2.m11).toBe(1);
    expect(m2.m12).toBe(0);
    expect(m2.m13).toBe(0);
    expect(m2.m20).toBe(0);
    expect(m2.m21).toBe(0);
    expect(m2.m22).toBe(1);
    expect(m2.m23).toBe(0);
    expect(m2.m30).toBe(0);
    expect(m2.m31).toBe(0);
    expect(m2.m32).toBe(0);
    expect(m2.m33).toBe(1);
  });

  test('clear() empties the pool', () => {
    const m = Matrix4Pool.get();
    Matrix4Pool.release(m);
    Matrix4Pool.clear();

    const m2 = Matrix4Pool.get();
    expect(m2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => Matrix4Pool.release(null as unknown as Matrix4)).not.toThrow();
  });
});
