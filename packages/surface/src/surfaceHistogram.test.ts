import { createSurface } from './surface';
import { equalizeSurfaceHistogram, getSurfaceHistogram } from './surfaceHistogram';
import { setSurfacePixel } from './surfacePixel';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('equalizeSurfaceHistogram', () => {
  it('spreads a narrow tonal range to fill 0..255', () => {
    // All red values are either 0 or 128 — a compressed range.
    const source = createSurface(2, 1);
    setSurfacePixel(source, 0, 0, 0x000000ff);
    setSurfacePixel(source, 1, 0, 0x808000ff);
    const dest = createSurface(2, 1);
    equalizeSurfaceHistogram(region(dest), region(source));
    // After equalization the darker pixel maps to 0 and brighter to 255
    expect(dest.data[0]).toBe(0);
    expect(dest.data[4]).toBe(255);
  });

  it('is safe in-place', () => {
    const surface = createSurface(2, 1);
    setSurfacePixel(surface, 0, 0, 0x000000ff);
    setSurfacePixel(surface, 1, 0, 0xff0000ff);
    expect(() => equalizeSurfaceHistogram(region(surface), region(surface))).not.toThrow();
  });

  it('preserves alpha unchanged', () => {
    const source = createSurface(1, 1, 0x40404080);
    const dest = createSurface(1, 1);
    equalizeSurfaceHistogram(region(dest), region(source));
    expect(dest.data[3]).toBe(0x80);
  });
});

describe('getSurfaceHistogram', () => {
  it('counts pixel values per channel', () => {
    const surface = createSurface(2, 1);
    setSurfacePixel(surface, 0, 0, 0x0a000000);
    setSurfacePixel(surface, 1, 0, 0x0a0000ff);
    const histogram = getSurfaceHistogram(region(surface));
    expect(histogram.red[0x0a]).toBe(2);
    expect(histogram.alpha[0]).toBe(1);
    expect(histogram.alpha[255]).toBe(1);
    expect(histogram.green[0]).toBe(2);
  });

  it('returns all-zero bins for an empty region', () => {
    const surface = createSurface(2, 2, 0xffffffff);
    const histogram = getSurfaceHistogram(region(surface, 0, 0, 0, 0));
    expect(histogram.red.reduce((a, b) => a + b, 0)).toBe(0);
    expect(histogram.red.length).toBe(256);
  });

  it('counts only a sub-region', () => {
    const surface = createSurface(2, 1);
    setSurfacePixel(surface, 0, 0, 0x10000000);
    setSurfacePixel(surface, 1, 0, 0x20000000);
    const histogram = getSurfaceHistogram(region(surface, 1, 0, 1, 1));
    expect(histogram.red[0x20]).toBe(1);
    expect(histogram.red[0x10]).toBe(0);
  });
});
