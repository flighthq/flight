import { createSurface } from './surface';
import { pixelateSurface } from './surfacePixelate';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('pixelateSurface', () => {
  it('averages a block to a single uniform color', () => {
    // 2x1 row: R=0 and R=100; a block of 2 averages both to 50.
    const source = createSurface(2, 1);
    source.data[0] = 0;
    source.data[4] = 100;
    source.data[3] = 255;
    source.data[7] = 255;
    const out = new Uint8ClampedArray(2 * 4);
    pixelateSurface(out, region(source), 2);
    expect(out[0]).toBe(50);
    expect(out[4]).toBe(50);
  });

  it('keeps each block independent', () => {
    const source = createSurface(2, 1);
    source.data[0] = 10;
    source.data[4] = 200;
    const out = new Uint8ClampedArray(2 * 4);
    pixelateSurface(out, region(source), 1);
    expect(out[0]).toBe(10);
    expect(out[4]).toBe(200);
  });

  it('can use source.surface.data as out for a full-surface region', () => {
    const surface = createSurface(2, 1);
    surface.data[0] = 0;
    surface.data[4] = 80;
    pixelateSurface(surface.data, region(surface), 2);
    expect(surface.data[0]).toBe(40);
    expect(surface.data[4]).toBe(40);
  });
});
