import { getSurfacePixel } from './pixel';
import { rotateSurface, rotateSurface180, rotateSurfaceClockwise, rotateSurfaceCounterClockwise } from './rotate';
import { createSurface } from './surface';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// 2x1 surface: pixel (0,0) = A, pixel (1,0) = B.
function ab() {
  const surface = createSurface(2, 1);
  surface.data.set([0xa0, 0, 0, 255], 0);
  surface.data.set([0xb0, 0, 0, 255], 4);
  return surface;
}

describe('rotateSurface', () => {
  it('with angle 0 copies source into dest', () => {
    const source = createSurface(3, 3, 0xff0000ff);
    const out = createSurface(3, 3);
    rotateSurface(region(out), region(source), 0);
    expect(out.data[0]).toBe(0xff);
    expect(out.data[3]).toBe(0xff);
  });

  it('with angle π reverses source similar to rotateSurface180', () => {
    const source = ab();
    const out = createSurface(2, 1);
    rotateSurface(region(out), region(source), Math.PI);
    // Bilinear introduces slight blending, so just check direction
    expect(out.data[0]).toBeGreaterThan(out.data[4]); // B-side (brighter) on left
  });

  it('writes transparent black for out-of-bounds positions', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const out = createSurface(5, 5);
    rotateSurface(region(out), region(source), 0);
    // Only center pixel maps back to source; corners are out of bounds
    expect(out.data[(0 * 5 + 0) * 4 + 3]).toBe(0);
    expect(out.data[(2 * 5 + 2) * 4 + 3]).toBe(0xff);
  });
});

describe('rotateSurface180', () => {
  it('reverses pixel order with matching dimensions', () => {
    const source = ab();
    const out = createSurface(2, 1);
    rotateSurface180(region(out), region(source));
    expect(out.data[0]).toBe(0xb0);
    expect(out.data[4]).toBe(0xa0);
  });

  it('rotates in place when dest and source are the same region', () => {
    const surface = ab();
    rotateSurface180(region(surface), region(surface));
    expect(surface.data[0]).toBe(0xb0);
    expect(surface.data[4]).toBe(0xa0);
  });
});

describe('rotateSurfaceClockwise', () => {
  it('rotates a row into a column, left element on top', () => {
    const source = ab();
    const out = createSurface(1, 2);
    rotateSurfaceClockwise(region(out), region(source));
    expect(getSurfacePixel(out, 0, 0)).toBe(getSurfacePixel(source, 0, 0));
    expect(getSurfacePixel(out, 0, 1)).toBe(getSurfacePixel(source, 1, 0));
  });
});

describe('rotateSurfaceCounterClockwise', () => {
  it('rotates a row into a column, right element on top', () => {
    const source = ab();
    const out = createSurface(1, 2);
    rotateSurfaceCounterClockwise(region(out), region(source));
    expect(getSurfacePixel(out, 0, 0)).toBe(getSurfacePixel(source, 1, 0));
    expect(getSurfacePixel(out, 0, 1)).toBe(getSurfacePixel(source, 0, 0));
  });
});
