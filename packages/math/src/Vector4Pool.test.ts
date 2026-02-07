import Vector4 from './Vector4.js';
import Vector4Pool from './Vector4Pool.js';

describe('Vector4Pool', () => {
  beforeEach(() => {
    Vector4Pool.clear();
  });

  test('get() returns a new Vector4 when pool is empty', () => {
    const v = Vector4Pool.get();
    expect(v).toBeInstanceOf(Vector4);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const v = Vector4Pool.getEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
    expect(v.w).toBe(0);
  });

  test('released matrices are reused by get()', () => {
    const v1 = Vector4Pool.get();
    Vector4Pool.release(v1);

    const v2 = Vector4Pool.get();
    expect(v2).toBe(v1); // same reference
  });

  test('getEmpty() resets released matrix to identity', () => {
    const v1 = Vector4Pool.get();
    v1.x = 5;
    v1.y = 10;

    Vector4Pool.release(v1);
    const v2 = Vector4Pool.getEmpty();

    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
    expect(v2.w).toBe(0);
  });

  test('clear() empties the pool', () => {
    const m = Vector4Pool.get();
    Vector4Pool.release(m);
    Vector4Pool.clear();

    const v2 = Vector4Pool.get();
    expect(v2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => Vector4Pool.release(null as unknown as Vector4)).not.toThrow();
  });
});
