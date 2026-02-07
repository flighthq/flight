import Vector3 from './Vector3.js';
import Vector3Pool from './Vector3Pool.js';

describe('Vector3Pool', () => {
  beforeEach(() => {
    Vector3Pool.clear();
  });

  test('get() returns a new Vector3 when pool is empty', () => {
    const v = Vector3Pool.get();
    expect(v).toBeInstanceOf(Vector3);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const v = Vector3Pool.getEmpty();
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  test('released matrices are reused by get()', () => {
    const v1 = Vector3Pool.get();
    Vector3Pool.release(v1);

    const v2 = Vector3Pool.get();
    expect(v2).toBe(v1); // same reference
  });

  test('getEmpty() resets released matrix to identity', () => {
    const v1 = Vector3Pool.get();
    v1.x = 5;
    v1.y = 10;

    Vector3Pool.release(v1);
    const v2 = Vector3Pool.getEmpty();

    expect(v2).toBe(v1);
    expect(v2.x).toBe(0);
    expect(v2.y).toBe(0);
    expect(v2.z).toBe(0);
  });

  test('clear() empties the pool', () => {
    const m = Vector3Pool.get();
    Vector3Pool.release(m);
    Vector3Pool.clear();

    const v2 = Vector3Pool.get();
    expect(v2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => Vector3Pool.release(null as unknown as Vector3)).not.toThrow();
  });
});
