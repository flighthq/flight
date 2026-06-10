import { createSurface } from '@flighthq/surface/surface';

import {
  applySurfaceBoxBlurFilter,
  applySurfaceGaussianBlurFilter,
  blurSurfacePixelsHorizontal,
  blurSurfacePixelsHorizontalWeighted,
  blurSurfacePixelsVertical,
  blurSurfacePixelsVerticalWeighted,
  computeGaussianKernel,
} from './blur';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// ─── computeGaussianKernel ────────────────────────────────────────────────────

describe('applySurfaceBoxBlurFilter', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(3, 1);
    source.data[7] = 255; // center pixel opaque
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceBoxBlurFilter(out, scratch, region(source), { blurX: 2, blurY: 0 });
    expect(out[3]).toBeGreaterThan(0);
    expect(out[11]).toBeGreaterThan(0);
  });

  it('writes source into out when blur is zero', () => {
    const source = createSurface(1, 1, 0x336699ff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceBoxBlurFilter(out, scratch, region(source), { blurX: 0, blurY: 0 });
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });

  it('result always lands in out regardless of pass parity', () => {
    const source = createSurface(3, 3, 0xffffff88);
    const out = new Uint8ClampedArray(3 * 3 * 4);
    const scratch = new Uint8ClampedArray(3 * 3 * 4);
    applySurfaceBoxBlurFilter(out, scratch, region(source), { blurX: 2, blurY: 0 });
    expect(out[3]).toBeGreaterThan(0);
  });

  it('source.surface.data can be used as out for a full-surface region', () => {
    const surface = createSurface(3, 1);
    surface.data[7] = 255;
    const scratch = new Uint8ClampedArray(3 * 4);
    applySurfaceBoxBlurFilter(surface.data, scratch, region(surface), { blurX: 2, blurY: 0 });
    expect(surface.data[3]).toBeGreaterThan(0);
    expect(surface.data[11]).toBeGreaterThan(0);
  });
});

// ─── blurSurfacePixelsHorizontal ──────────────────────────────────────────────

describe('applySurfaceGaussianBlurFilter', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(5, 1);
    source.data[2 * 4 + 3] = 255; // center pixel opaque
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    applySurfaceGaussianBlurFilter(out, scratch, region(source), 1.0);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[4 * 4 + 3]).toBeGreaterThan(0);
  });

  it('center pixel retains more weight than edges', () => {
    const source = createSurface(5, 1);
    source.data[2 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    applySurfaceGaussianBlurFilter(out, scratch, region(source), 0.8);
    expect(out[2 * 4 + 3]).toBeGreaterThan(out[3]);
  });

  it('with sigma=0 writes source unchanged', () => {
    const source = createSurface(1, 1, 0x336699ff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGaussianBlurFilter(out, scratch, region(source), 0);
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });

  it('result always lands in out regardless of pass parity', () => {
    const source = createSurface(3, 3, 0xffffff88);
    const out = new Uint8ClampedArray(3 * 3 * 4);
    const scratch = new Uint8ClampedArray(3 * 3 * 4);
    applySurfaceGaussianBlurFilter(out, scratch, region(source), 1.0);
    expect(out[3]).toBeGreaterThan(0);
  });
});

// ─── blurSurfacePixelsVertical ────────────────────────────────────────────────

describe('blurSurfacePixelsHorizontal', () => {
  it('spreads alpha into horizontal neighbors', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsHorizontal(out, source, 3, 1, 1);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[11]).toBeGreaterThan(0);
  });

  it('copies source to out without spreading when radius is 0', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(8);
    blurSurfacePixelsHorizontal(out, source, 2, 1, 0);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
  });

  it('produces correct edge average for a single row', () => {
    // pixels: [0, 255, 0] alpha only; radius=1
    // x=0: avg([0,255])/2 = 128 (approx); x=1: avg([0,255,0])/3 = 85; x=2: avg([255,0])/2 = 128
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsHorizontal(out, source, 3, 1, 1);
    expect(out[3]).toBe(128); // (0+255)/2
    expect(out[7]).toBe(85); // (0+255+0)/3
    expect(out[11]).toBe(128); // (255+0)/2
  });
});

// ─── blurSurfacePixelsHorizontalWeighted ─────────────────────────────────────

describe('blurSurfacePixelsHorizontalWeighted', () => {
  it('applies Gaussian weights to horizontal neighbors', () => {
    const kernel = new Float32Array(3);
    computeGaussianKernel(kernel, 1, 0.8);
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsHorizontalWeighted(out, source, 3, 1, kernel);
    // center weight >> edge; center alpha should be highest
    expect(out[7]).toBeGreaterThan(out[3]);
    expect(out[7]).toBeGreaterThan(out[11]);
  });

  it('with an identity kernel [1] leaves source unchanged', () => {
    const kernel = new Float32Array([1]);
    const source = new Uint8ClampedArray([0x11, 0x22, 0x33, 0xff]);
    const out = new Uint8ClampedArray(4);
    blurSurfacePixelsHorizontalWeighted(out, source, 1, 1, kernel);
    expect(out[0]).toBe(0x11);
    expect(out[3]).toBe(0xff);
  });
});

// ─── blurSurfacePixelsVerticalWeighted ───────────────────────────────────────

describe('blurSurfacePixelsVertical', () => {
  it('spreads alpha into vertical neighbors', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsVertical(out, source, 1, 3, 1);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[11]).toBeGreaterThan(0);
  });
});

// ─── applySurfaceBoxBlurFilter ────────────────────────────────────────────────

describe('blurSurfacePixelsVerticalWeighted', () => {
  it('applies Gaussian weights to vertical neighbors', () => {
    const kernel = new Float32Array(3);
    computeGaussianKernel(kernel, 1, 0.8);
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsVerticalWeighted(out, source, 1, 3, kernel);
    expect(out[7]).toBeGreaterThan(out[3]);
  });
});

// ─── applySurfaceGaussianBlurFilter ──────────────────────────────────────────

describe('computeGaussianKernel', () => {
  it('produces a kernel that sums to 1', () => {
    const kernel = new Float32Array(7);
    computeGaussianKernel(kernel, 3, 1.0);
    const sum = kernel.reduce((acc, v) => acc + v, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    const kernel = new Float32Array(9);
    computeGaussianKernel(kernel, 4, 1.5);
    for (let i = 0; i < 4; i++) {
      expect(kernel[i]).toBeCloseTo(kernel[8 - i], 10);
    }
  });

  it('center weight is the largest', () => {
    const kernel = new Float32Array(5);
    computeGaussianKernel(kernel, 2, 1.0);
    expect(kernel[2]).toBeGreaterThan(kernel[1]);
    expect(kernel[1]).toBeGreaterThan(kernel[0]);
  });

  it('radius-0 kernel produces a single weight of 1', () => {
    const kernel = new Float32Array(1);
    computeGaussianKernel(kernel, 0, 1.0);
    expect(kernel[0]).toBeCloseTo(1, 10);
  });
});
