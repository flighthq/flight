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
    fillSurfaceRectangle(img, 2, 3, 3, 2, 0xffff0000);
    const rect = getSurfaceColorBoundsRectangle(img, 0xffffffff, 0xffff0000);
    expect(rect).toEqual({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('finds non-matching pixels when findColor is false', () => {
    const img = createSurface(4, 4, 0xffffffff);
    fillSurfaceRectangle(img, 1, 1, 2, 2, 0xff000000);
    const rect = getSurfaceColorBoundsRectangle(img, 0xffffffff, 0xffffffff, false);
    expect(rect).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('respects the mask', () => {
    const img = createSurface(2, 2);
    fillSurfaceRectangle(img, 0, 0, 2, 2, 0xff112233);
    const rect = getSurfaceColorBoundsRectangle(img, 0xffff0000, 0xff110000);
    expect(rect).not.toBeNull();
  });
});
