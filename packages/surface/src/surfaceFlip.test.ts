import { createSurface } from './surface';
import { flipSurfaceHorizontal, flipSurfaceVertical } from './surfaceFlip';
import { getSurfacePixel } from './surfacePixel';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

function ramp(width: number, height: number) {
  const surface = createSurface(width, height);
  for (let i = 0; i < width * height; i++) {
    surface.data[i * 4] = i;
    surface.data[i * 4 + 3] = 255;
  }
  return surface;
}

describe('flipSurfaceHorizontal', () => {
  it('mirrors columns left-to-right into a separate dest', () => {
    const source = ramp(3, 1);
    const out = createSurface(3, 1);
    flipSurfaceHorizontal(region(out), region(source));
    expect(out.data[0]).toBe(2);
    expect(out.data[4]).toBe(1);
    expect(out.data[8]).toBe(0);
  });

  it('mirrors in place when dest and source are the same region', () => {
    const surface = ramp(4, 1);
    flipSurfaceHorizontal(region(surface), region(surface));
    expect(surface.data[0]).toBe(3);
    expect(surface.data[4]).toBe(2);
    expect(surface.data[8]).toBe(1);
    expect(surface.data[12]).toBe(0);
  });
});

describe('flipSurfaceVertical', () => {
  it('mirrors rows top-to-bottom into a separate dest', () => {
    const source = ramp(1, 3);
    const out = createSurface(1, 3);
    flipSurfaceVertical(region(out), region(source));
    expect(getSurfacePixel(out, 0, 0)).toBe(getSurfacePixel(source, 0, 2));
    expect(getSurfacePixel(out, 0, 2)).toBe(getSurfacePixel(source, 0, 0));
  });

  it('mirrors in place when dest and source are the same region', () => {
    const surface = ramp(1, 4);
    flipSurfaceVertical(region(surface), region(surface));
    expect(surface.data[0]).toBe(3);
    expect(surface.data[12]).toBe(0);
  });
});
