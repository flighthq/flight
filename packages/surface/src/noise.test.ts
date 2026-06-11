import { fillSurfaceNoise, fillSurfacePerlinNoise } from './noise';
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

describe('fillSurfaceNoise', () => {
  it('is deterministic for the same seed', () => {
    const a = createSurface(4, 4);
    const b = createSurface(4, 4);
    fillSurfaceNoise(region(a), 12345);
    fillSurfaceNoise(region(b), 12345);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('produces different output for different seeds', () => {
    const a = createSurface(8, 8);
    const b = createSurface(8, 8);
    fillSurfaceNoise(region(a), 1);
    fillSurfaceNoise(region(b), 2);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('grayscale gives every pixel equal R, G, B', () => {
    const surface = createSurface(4, 4);
    fillSurfaceNoise(region(surface), 99, 0, 255, true);
    for (let i = 0; i < surface.data.length; i += 4) {
      expect(surface.data[i]).toBe(surface.data[i + 1]);
      expect(surface.data[i + 1]).toBe(surface.data[i + 2]);
    }
  });

  it('respects the low/high range and sets alpha opaque', () => {
    const surface = createSurface(8, 8);
    fillSurfaceNoise(region(surface), 7, 100, 110);
    for (let i = 0; i < surface.data.length; i += 4) {
      expect(surface.data[i]).toBeGreaterThanOrEqual(100);
      expect(surface.data[i]).toBeLessThanOrEqual(110);
      expect(surface.data[i + 3]).toBe(255);
    }
  });

  it('fills only the given sub-region', () => {
    const surface = createSurface(2, 1, 0x000000ff);
    fillSurfaceNoise(region(surface, 1, 0, 1, 1), 5, 200, 255);
    expect(surface.data[0]).toBe(0); // left pixel untouched
    expect(surface.data[4]).toBeGreaterThanOrEqual(200);
  });
});

describe('fillSurfacePerlinNoise', () => {
  it('is deterministic for the same seed', () => {
    const a = createSurface(8, 8);
    const b = createSurface(8, 8);
    fillSurfacePerlinNoise(region(a), 16, 16, 3, 42);
    fillSurfacePerlinNoise(region(b), 16, 16, 3, 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('keeps values in range and alpha opaque', () => {
    const surface = createSurface(8, 8);
    fillSurfacePerlinNoise(region(surface), 8, 8, 2, 5);
    for (let i = 0; i < surface.data.length; i += 4) {
      expect(surface.data[i]).toBeGreaterThanOrEqual(0);
      expect(surface.data[i]).toBeLessThanOrEqual(255);
      expect(surface.data[i + 3]).toBe(255);
    }
  });

  it('grayscale gives every pixel equal R, G, B', () => {
    const surface = createSurface(8, 8);
    fillSurfacePerlinNoise(region(surface), 8, 8, 2, 5, true);
    for (let i = 0; i < surface.data.length; i += 4) {
      expect(surface.data[i]).toBe(surface.data[i + 1]);
      expect(surface.data[i + 1]).toBe(surface.data[i + 2]);
    }
  });

  it('produces smooth low-frequency fields (neighbors stay close)', () => {
    const surface = createSurface(16, 1);
    fillSurfacePerlinNoise(region(surface), 32, 32, 1, 3, true);
    let maxStep = 0;
    for (let x = 1; x < 16; x++) {
      maxStep = Math.max(maxStep, Math.abs(surface.data[x * 4] - surface.data[(x - 1) * 4]));
    }
    expect(maxStep).toBeLessThan(64);
  });
});
