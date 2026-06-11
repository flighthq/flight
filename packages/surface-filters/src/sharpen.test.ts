import { createSurface } from '@flighthq/surface';

import { applySurfaceSharpenFilter } from './sharpen';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('applySurfaceSharpenFilter', () => {
  it('amount 0 returns the source RGB and preserves alpha', () => {
    const source = createSurface(3, 1);
    source.data.set([10, 20, 30, 120], 4);
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceSharpenFilter(out, scratch, region(source), { amount: 0 });
    expect(out[4]).toBe(10);
    expect(out[5]).toBe(20);
    expect(out[6]).toBe(30);
    expect(out[7]).toBe(120);
  });

  it('accentuates a bright center pixel above its original value', () => {
    const source = createSurface(5, 1);
    source.data[2 * 4] = 100;
    for (let i = 0; i < 5; i++) source.data[i * 4 + 3] = 255;
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    applySurfaceSharpenFilter(out, scratch, region(source), { amount: 1, radiusX: 4, radiusY: 0 });
    expect(out[2 * 4]).toBeGreaterThan(100);
  });

  it('preserves source alpha while sharpening RGB', () => {
    const source = createSurface(3, 1);
    for (let i = 0; i < 3; i++) {
      source.data[i * 4] = i * 40;
      source.data[i * 4 + 3] = 77;
    }
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceSharpenFilter(out, scratch, region(source), { amount: 2 });
    expect(out[3]).toBe(77);
    expect(out[7]).toBe(77);
    expect(out[11]).toBe(77);
  });
});
