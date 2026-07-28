import { createBitmap } from './bitmap';
import {
  fillBitmapNoise,
  fillBitmapPerlinNoise,
  fillBitmapTurbulence,
  SURFACE_NOISE_CHANNEL_A,
  SURFACE_NOISE_CHANNEL_R,
} from './bitmapNoise';

function region(bitmap: ReturnType<typeof createBitmap>, x = 0, y = 0, width = bitmap.width, height = bitmap.height) {
  return { bitmap, x, y, width, height };
}

describe('fillBitmapNoise', () => {
  it('is deterministic for the same seed', () => {
    const a = createBitmap(4, 4);
    const b = createBitmap(4, 4);
    fillBitmapNoise(region(a), 12345);
    fillBitmapNoise(region(b), 12345);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('produces different output for different seeds', () => {
    const a = createBitmap(8, 8);
    const b = createBitmap(8, 8);
    fillBitmapNoise(region(a), 1);
    fillBitmapNoise(region(b), 2);
    expect(Array.from(a.data)).not.toEqual(Array.from(b.data));
  });

  it('grayscale gives every pixel equal R, G, B', () => {
    const bitmap = createBitmap(4, 4);
    fillBitmapNoise(region(bitmap), 99, 0, 255, true);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBe(bitmap.data[i + 1]);
      expect(bitmap.data[i + 1]).toBe(bitmap.data[i + 2]);
    }
  });

  it('respects the low/high range and sets alpha opaque', () => {
    const bitmap = createBitmap(8, 8);
    fillBitmapNoise(region(bitmap), 7, 100, 110);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBeGreaterThanOrEqual(100);
      expect(bitmap.data[i]).toBeLessThanOrEqual(110);
      expect(bitmap.data[i + 3]).toBe(255);
    }
  });

  it('fills only the given sub-region', () => {
    const bitmap = createBitmap(2, 1, 0x000000ff);
    fillBitmapNoise(region(bitmap, 1, 0, 1, 1), 5, 200, 255);
    expect(bitmap.data[0]).toBe(0); // left pixel untouched
    expect(bitmap.data[4]).toBeGreaterThanOrEqual(200);
  });
});

describe('fillBitmapPerlinNoise', () => {
  it('is deterministic for the same seed', () => {
    const a = createBitmap(8, 8);
    const b = createBitmap(8, 8);
    fillBitmapPerlinNoise(region(a), 16, 16, 3, 42);
    fillBitmapPerlinNoise(region(b), 16, 16, 3, 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('keeps values in range and alpha opaque', () => {
    const bitmap = createBitmap(8, 8);
    fillBitmapPerlinNoise(region(bitmap), 8, 8, 2, 5);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBeGreaterThanOrEqual(0);
      expect(bitmap.data[i]).toBeLessThanOrEqual(255);
      expect(bitmap.data[i + 3]).toBe(255);
    }
  });

  it('grayscale gives every pixel equal R, G, B', () => {
    const bitmap = createBitmap(8, 8);
    fillBitmapPerlinNoise(region(bitmap), 8, 8, 2, 5, true);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBe(bitmap.data[i + 1]);
      expect(bitmap.data[i + 1]).toBe(bitmap.data[i + 2]);
    }
  });

  it('produces smooth low-frequency fields (neighbors stay close)', () => {
    const bitmap = createBitmap(16, 1);
    fillBitmapPerlinNoise(region(bitmap), 32, 32, 1, 3, true);
    let maxStep = 0;
    for (let x = 1; x < 16; x++) {
      maxStep = Math.max(maxStep, Math.abs(bitmap.data[x * 4] - bitmap.data[(x - 1) * 4]));
    }
    expect(maxStep).toBeLessThan(64);
  });

  it('fills selected channels only and leaves alpha opaque by default', () => {
    const bitmap = createBitmap(8, 8, 0x000000ff);
    fillBitmapPerlinNoise(region(bitmap), 8, 8, 2, 5, false, false, SURFACE_NOISE_CHANNEL_R);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      // G and B were not selected, so they stay at their initial 0.
      expect(bitmap.data[i + 1]).toBe(0);
      expect(bitmap.data[i + 2]).toBe(0);
      // Alpha not selected -> forced opaque.
      expect(bitmap.data[i + 3]).toBe(255);
    }
  });
});

describe('fillBitmapTurbulence', () => {
  it('is deterministic for the same seed', () => {
    const a = createBitmap(8, 8);
    const b = createBitmap(8, 8);
    fillBitmapTurbulence(region(a), 16, 16, 3, 42);
    fillBitmapTurbulence(region(b), 16, 16, 3, 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('keeps values in range and alpha opaque', () => {
    const bitmap = createBitmap(8, 8);
    fillBitmapTurbulence(region(bitmap), 8, 8, 2, 5);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBeGreaterThanOrEqual(0);
      expect(bitmap.data[i]).toBeLessThanOrEqual(255);
      expect(bitmap.data[i + 3]).toBe(255);
    }
  });

  it('grayscale gives every pixel equal R, G, B', () => {
    const bitmap = createBitmap(8, 8);
    fillBitmapTurbulence(region(bitmap), 8, 8, 2, 5, true);
    for (let i = 0; i < bitmap.data.length; i += 4) {
      expect(bitmap.data[i]).toBe(bitmap.data[i + 1]);
      expect(bitmap.data[i + 1]).toBe(bitmap.data[i + 2]);
    }
  });

  it('writes noise into alpha when the A channel is selected', () => {
    const bitmap = createBitmap(8, 8, 0x000000ff);
    fillBitmapTurbulence(region(bitmap), 4, 4, 3, 9, false, false, SURFACE_NOISE_CHANNEL_A);
    let sawNonOpaque = false;
    for (let i = 0; i < bitmap.data.length; i += 4) {
      if (bitmap.data[i + 3] !== 255) sawNonOpaque = true;
    }
    expect(sawNonOpaque).toBe(true);
  });

  it('differs from the smooth fractal sum for the same parameters', () => {
    const turbulent = createBitmap(8, 8);
    const fractal = createBitmap(8, 8);
    fillBitmapTurbulence(region(turbulent), 8, 8, 3, 7, true);
    fillBitmapPerlinNoise(region(fractal), 8, 8, 3, 7, true);
    expect(Array.from(turbulent.data)).not.toEqual(Array.from(fractal.data));
  });

  it('fills only the given sub-region', () => {
    const bitmap = createBitmap(2, 1, 0x010203ff);
    fillBitmapTurbulence(region(bitmap, 1, 0, 1, 1), 8, 8, 2, 3);
    // Left pixel untouched.
    expect(bitmap.data[0]).toBe(1);
    expect(bitmap.data[1]).toBe(2);
    expect(bitmap.data[2]).toBe(3);
  });
});
