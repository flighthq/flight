import { createSurface } from './surface';
import { fillSurfaceRectangle } from './surfaceFill';
import { getSurfaceColorBoundsRectangle } from './surfaceQuery';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('getSurfaceColorBoundsRectangle', () => {
  it('returns null when no pixels match', () => {
    const img = createSurface(4, 4);
    expect(getSurfaceColorBoundsRectangle(region(img), 0xffffffff, 0xffffffff)).toBeNull();
  });

  it('finds the bounding rect of matching pixels', () => {
    const img = createSurface(8, 8);
    fillSurfaceRectangle(region(img, 2, 3, 3, 2), 0xff0000ff);
    const rect = getSurfaceColorBoundsRectangle(region(img), 0xffffffff, 0xff0000ff);
    expect(rect).toEqual({ x: 2, y: 3, width: 3, height: 2 });
  });

  it('finds non-matching pixels when findColor is false', () => {
    const img = createSurface(4, 4, 0xffffffff);
    fillSurfaceRectangle(region(img, 1, 1, 2, 2), 0x000000ff);
    const rect = getSurfaceColorBoundsRectangle(region(img), 0xffffffff, 0xffffffff, false);
    expect(rect).toEqual({ x: 1, y: 1, width: 2, height: 2 });
  });

  it('respects the mask', () => {
    const img = createSurface(2, 2);
    fillSurfaceRectangle(region(img), 0x112233ff);
    const rect = getSurfaceColorBoundsRectangle(region(img), 0xff0000ff, 0x110000ff);
    expect(rect).not.toBeNull();
  });

  it('reports surface-absolute coordinates when scanning a sub-region', () => {
    const img = createSurface(8, 8);
    fillSurfaceRectangle(region(img, 5, 5, 2, 2), 0xff0000ff);
    const rect = getSurfaceColorBoundsRectangle(region(img, 4, 4, 4, 4), 0xffffffff, 0xff0000ff);
    expect(rect).toEqual({ x: 5, y: 5, width: 2, height: 2 });
  });
});
