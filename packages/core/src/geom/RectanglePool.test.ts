import Rectangle from './Rectangle.js';
import RectanglePool from './RectanglePool.js';

describe('RectanglePool', () => {
  beforeEach(() => {
    RectanglePool.clear();
  });

  test('get() returns a new Rectangle when pool is empty', () => {
    const r = RectanglePool.get();
    expect(r).toBeInstanceOf(Rectangle);
  });

  test('getEmpty() returns a rectangle with all properties set to 0', () => {
    const r = RectanglePool.getEmpty();
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });

  test('released rectangles are reused by get()', () => {
    const r1 = RectanglePool.get();
    RectanglePool.release(r1);

    const r2 = RectanglePool.get();
    expect(r2).toBe(r1); // same reference reused
  });

  test('getEmpty() resets a released rectangle to empty', () => {
    const r1 = RectanglePool.get();
    r1.x = 5;
    r1.y = 10;
    r1.width = 50;
    r1.height = 100;

    RectanglePool.release(r1);
    const r2 = RectanglePool.getEmpty();

    expect(r2).toBe(r1);
    expect(r2.x).toBe(0);
    expect(r2.y).toBe(0);
    expect(r2.width).toBe(0);
    expect(r2.height).toBe(0);
  });

  test('clear() empties the pool', () => {
    const r = RectanglePool.get();
    RectanglePool.release(r);
    RectanglePool.clear();

    const r2 = RectanglePool.get();
    expect(r2).not.toBe(r); // pool was cleared, new instance
  });

  test('release() handles null safely', () => {
    expect(() => RectanglePool.release(null as unknown as Rectangle)).not.toThrow();
  });
});
