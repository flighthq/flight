import { fillSurfaceRectangle } from './fill';
import { getSurfaceColorBoundsRectangle } from './query';
import { createSurface } from './surface';

describe('getSurfaceColorBoundsRectangle', () => {
  it('returns null when no pixels match', () => {
    const img = createSurface(4, 4);
    expect(getSurfaceColorBoundsRectangle(img, 0xffffffff, 0xffffffff)).toBeNull();
  });

  it('finds the bounding rect of matching pixels', () => {
    const img = createSurface(8, 8);
    fillSurfaceRectangle(img, 2, 3, 3, 2, 0xff0000ff);
    const rect = getSurfaceColorBoundsRectangle(img, 0xffffffff, 0xff0000ff);
    expect(rect).toEqual({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('finds non-matching pixels when findColor is false', () => {
    const img = createSurface(4, 4, 0xffffffff);
    fillSurfaceRectangle(img, 1, 1, 2, 2, 0x000000ff);
    const rect = getSurfaceColorBoundsRectangle(img, 0xffffffff, 0xffffffff, false);
    expect(rect).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('respects the mask', () => {
    const img = createSurface(2, 2);
    fillSurfaceRectangle(img, 0, 0, 2, 2, 0x112233ff);
    const rect = getSurfaceColorBoundsRectangle(img, 0xff0000ff, 0x110000ff);
    expect(rect).not.toBeNull();
  });
});
