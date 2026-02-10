import Affine2D from './Affine2D.js';
import Affine2DPool from './Affine2DPool.js';

describe('Affine2DPool', () => {
  beforeEach(() => {
    Affine2DPool.clear();
  });

  test('get() returns a new Affine2D when pool is empty', () => {
    const m = Affine2DPool.get();
    expect(m).toBeInstanceOf(Affine2D);
  });

  test('getIdentity() returns a matrix set to identity', () => {
    const m = Affine2DPool.getIdentity();
    expect(m.a).toBe(1);
    expect(m.b).toBe(0);
    expect(m.c).toBe(0);
    expect(m.d).toBe(1);
    expect(m.tx).toBe(0);
    expect(m.ty).toBe(0);
  });

  test('released matrices are reused by get()', () => {
    const m1 = Affine2DPool.get();
    Affine2DPool.release(m1);

    const m2 = Affine2DPool.get();
    expect(m2).toBe(m1); // same reference
  });

  test('getIdentity() resets released matrix to identity', () => {
    const m1 = Affine2DPool.get();
    m1.a = 5;
    m1.tx = 10;

    Affine2DPool.release(m1);
    const m2 = Affine2DPool.getIdentity();

    expect(m2).toBe(m1);
    expect(m2.a).toBe(1);
    expect(m2.b).toBe(0);
    expect(m2.c).toBe(0);
    expect(m2.d).toBe(1);
    expect(m2.tx).toBe(0);
    expect(m2.ty).toBe(0);
  });

  test('clear() empties the pool', () => {
    const m = Affine2DPool.get();
    Affine2DPool.release(m);
    Affine2DPool.clear();

    const m2 = Affine2DPool.get();
    expect(m2).not.toBe(m); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => Affine2DPool.release(null as unknown as Affine2D)).not.toThrow();
  });
});
