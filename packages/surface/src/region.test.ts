import { createSurfaceRegion, setSurfaceRegion } from './region';
import { createSurface } from './surface';

describe('createSurfaceRegion', () => {
  it('covers the whole surface when no bounds are given', () => {
    const surface = createSurface(7, 5);
    const r = createSurfaceRegion(surface);
    expect(r).toEqual({ surface, x: 0, y: 0, width: 7, height: 5 });
  });

  it('uses the supplied bounds', () => {
    const surface = createSurface(8, 8);
    const r = createSurfaceRegion(surface, 1, 2, 3, 4);
    expect(r).toEqual({ surface, x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('setSurfaceRegion', () => {
  it('mutates the existing region without allocating a new object', () => {
    const surface = createSurface(8, 8);
    const r = createSurfaceRegion(surface);
    const returned = setSurfaceRegion(r, surface, 2, 3, 4, 5);
    expect(returned).toBe(r);
    expect(r).toEqual({ surface, x: 2, y: 3, width: 4, height: 5 });
  });

  it('covers the whole surface when no bounds are given', () => {
    const a = createSurface(2, 2);
    const b = createSurface(6, 9);
    const r = createSurfaceRegion(a);
    setSurfaceRegion(r, b);
    expect(r).toEqual({ surface: b, x: 0, y: 0, width: 6, height: 9 });
  });
});
