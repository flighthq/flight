import { createSurface } from './surface';
import {
  blurSurfacePixelsHorizontal,
  blurSurfacePixelsHorizontalWeighted,
  blurSurfacePixelsVertical,
  blurSurfacePixelsVerticalWeighted,
  boxBlurSurface,
  computeGaussianKernel,
  gaussianBlurSurface,
} from './surfaceBlur';
import { premultiplySurfacePixels, unpremultiplySurfacePixels } from './surfaceFormat';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

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

  it('premultiplying before blur avoids the dark-halo artifact at transparent edges', () => {
    // [opaque red, transparent]. Straight-alpha blur bleeds the transparent
    // pixel's hidden black into the red; a premultiplied blur keeps it pure red.
    const buf = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);

    const straight = new Uint8ClampedArray(8);
    blurSurfacePixelsHorizontal(straight, buf, 2, 1, 1);
    expect(straight[4]).toBe(128); // transparent pixel's red darkened toward black

    const premul = new Uint8ClampedArray(8);
    premultiplySurfacePixels(premul, buf, 8);
    const blurred = new Uint8ClampedArray(8);
    blurSurfacePixelsHorizontal(blurred, premul, 2, 1, 1);
    const result = new Uint8ClampedArray(8);
    unpremultiplySurfacePixels(result, blurred, 8);
    expect(result[4]).toBe(255); // red stays pure
    expect(result[7]).toBe(128); // alpha still half
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

describe('blurSurfacePixelsVertical', () => {
  it('spreads alpha into vertical neighbors', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsVertical(out, source, 1, 3, 1);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[11]).toBeGreaterThan(0);
  });
});

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

describe('boxBlurSurface', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(3, 1);
    source.data[7] = 255; // center pixel opaque
    const out = new Uint8ClampedArray(3 * 4);
    const scratch = new Uint8ClampedArray(3 * 4);
    boxBlurSurface(out, scratch, region(source), { radiusX: 2, radiusY: 0 });
    expect(out[3]).toBeGreaterThan(0);
    expect(out[11]).toBeGreaterThan(0);
  });

  it('writes source into out when blur is zero', () => {
    const source = createSurface(1, 1, 0x336699ff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    boxBlurSurface(out, scratch, region(source), { radiusX: 0, radiusY: 0 });
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });

  it('result always lands in out regardless of pass parity', () => {
    const source = createSurface(3, 3, 0xffffff88);
    const out = new Uint8ClampedArray(3 * 3 * 4);
    const scratch = new Uint8ClampedArray(3 * 3 * 4);
    boxBlurSurface(out, scratch, region(source), { radiusX: 2, radiusY: 0 });
    expect(out[3]).toBeGreaterThan(0);
  });

  it('source.surface.data can be used as out for a full-surface region', () => {
    const surface = createSurface(3, 1);
    surface.data[7] = 255;
    const scratch = new Uint8ClampedArray(3 * 4);
    boxBlurSurface(surface.data, scratch, region(surface), { radiusX: 2, radiusY: 0 });
    expect(surface.data[3]).toBeGreaterThan(0);
    expect(surface.data[11]).toBeGreaterThan(0);
  });

  it('blurs only the offset sub-region, reading from the right source pixels', () => {
    // 4 px alpha: [_, 255, 100, _]. Blurring region (1,0,2,1) extracts [255,100]
    // and averages them — proving the source x-offset is honored, not ignored.
    const surface = createSurface(4, 1);
    surface.data[1 * 4 + 3] = 255;
    surface.data[2 * 4 + 3] = 100;
    const out = new Uint8ClampedArray(2 * 4);
    const scratch = new Uint8ClampedArray(2 * 4);
    boxBlurSurface(out, scratch, region(surface, 1, 0, 2, 1), { radiusX: 2, radiusY: 0 });
    expect(out[3]).toBe(178); // round((255 + 100) / 2)
    expect(out[7]).toBe(178);
  });
});

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

  it('sigma <= 0 produces a unit impulse rather than a NaN kernel', () => {
    const kernel = new Float32Array(5).fill(9);
    computeGaussianKernel(kernel, 2, 0);
    expect(kernel[2]).toBe(1);
    expect(kernel[0]).toBe(0);
    expect(kernel[4]).toBe(0);
    expect(kernel.every((v) => !Number.isNaN(v))).toBe(true);
  });
});

describe('gaussianBlurSurface', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(5, 1);
    source.data[2 * 4 + 3] = 255; // center pixel opaque
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    gaussianBlurSurface(out, scratch, region(source), 1.0);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[4 * 4 + 3]).toBeGreaterThan(0);
  });

  it('center pixel retains more weight than edges', () => {
    const source = createSurface(5, 1);
    source.data[2 * 4 + 3] = 255;
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    gaussianBlurSurface(out, scratch, region(source), 0.8);
    expect(out[2 * 4 + 3]).toBeGreaterThan(out[3]);
  });

  it('with sigma=0 writes source unchanged', () => {
    const source = createSurface(1, 1, 0x336699ff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    gaussianBlurSurface(out, scratch, region(source), 0);
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });

  it('result always lands in out regardless of pass parity', () => {
    const source = createSurface(3, 3, 0xffffff88);
    const out = new Uint8ClampedArray(3 * 3 * 4);
    const scratch = new Uint8ClampedArray(3 * 3 * 4);
    gaussianBlurSurface(out, scratch, region(source), 1.0);
    expect(out[3]).toBeGreaterThan(0);
  });
});
