import { getSurfaceHistogram } from './histogram';
import { setSurfacePixel32 } from './pixel';
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

describe('getSurfaceHistogram', () => {
  it('counts pixel values per channel', () => {
    const surface = createSurface(2, 1);
    setSurfacePixel32(surface, 0, 0, 0x0a000000);
    setSurfacePixel32(surface, 1, 0, 0x0a0000ff);
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
    setSurfacePixel32(surface, 0, 0, 0x10000000);
    setSurfacePixel32(surface, 1, 0, 0x20000000);
    const histogram = getSurfaceHistogram(region(surface, 1, 0, 1, 1));
    expect(histogram.red[0x20]).toBe(1);
    expect(histogram.red[0x10]).toBe(0);
  });
});
