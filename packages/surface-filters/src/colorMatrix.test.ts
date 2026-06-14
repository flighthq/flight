import { createSurface } from '@flighthq/surface';

import {
  applySurfaceColorMatrixFilter,
  buildBrightnessColorMatrix,
  buildContrastColorMatrix,
  buildGrayscaleColorMatrix,
  buildHueRotationColorMatrix,
  buildInvertColorMatrix,
  buildSaturationColorMatrix,
  buildSepiaColorMatrix,
  concatColorMatrix,
  setColorMatrixIdentity,
} from './colorMatrix';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// Build a 1x1 surface, apply `matrix`, and return its RGBA bytes.
function applyTo(rgba: number, matrix: ReadonlyArray<number>): Uint8ClampedArray {
  const surface = createSurface(1, 1, rgba);
  const out = new Uint8ClampedArray(4);
  applySurfaceColorMatrixFilter(out, region(surface), matrix);
  return out;
}

describe('applySurfaceColorMatrixFilter', () => {
  it('applies a 4x5 color matrix to the source region', () => {
    const source = createSurface(1, 1, 0x204060ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceColorMatrixFilter(out, region(source), [0, 0, 0, 0, 10, 0, 0, 0, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0, 1, 0]);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
    expect(out[3]).toBe(0xff);
  });

  it('is safe when out aliases source.surface.data for a full-surface region', () => {
    const surface = createSurface(1, 1, 0x010203ff);
    applySurfaceColorMatrixFilter(
      surface.data,
      region(surface),
      [1, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 0, 1, 0, 30, 0, 0, 0, 1, 0],
    );
    expect(surface.data[0]).toBe(11);
    expect(surface.data[1]).toBe(22);
    expect(surface.data[2]).toBe(33);
    expect(surface.data[3]).toBe(0xff);
  });

  it('clamps output to [0, 255]', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const out = new Uint8ClampedArray(4);
    applySurfaceColorMatrixFilter(
      out,
      region(source),
      [10, 0, 0, 0, 100, 0, 0, 0, 0, -50, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
    );
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
  });

  it('throws when the matrix is too short', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => applySurfaceColorMatrixFilter(out, region(source), [])).toThrow(
      'Color matrix filter requires 20 values',
    );
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createSurface(1, 1, 0xff0000ff);
    const out = new Uint8ClampedArray(4 * 4);
    const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    applySurfaceColorMatrixFilter(out, region(source, -1, -1, 2, 2), identity);
    // only bottom-right pixel of the 2x2 region is in-bounds
    const i = (1 * 2 + 1) * 4;
    expect(out[i]).toBe(0xff);
    expect(out[0]).toBe(0);
  });
});

describe('buildBrightnessColorMatrix', () => {
  it('multiplies RGB by the amount', () => {
    const m = new Array<number>(20);
    buildBrightnessColorMatrix(m, 0.5);
    const out = applyTo(0xc86432ff, m); // R=200 G=100 B=50
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(50);
    expect(out[2]).toBe(25);
    expect(out[3]).toBe(0xff);
  });
});

describe('buildContrastColorMatrix', () => {
  it('amount 0 flattens every channel to mid grey', () => {
    const m = new Array<number>(20);
    buildContrastColorMatrix(m, 0);
    const out = applyTo(0xc80000ff, m); // R=200
    expect(out[0]).toBe(128); // round(127.5)
    expect(out[1]).toBe(128);
  });
});

describe('buildGrayscaleColorMatrix', () => {
  it('maps pure red to its luma in every channel', () => {
    const m = new Array<number>(20);
    buildGrayscaleColorMatrix(m);
    const out = applyTo(0xff0000ff, m);
    expect(out[0]).toBe(54); // round(0.213 * 255)
    expect(out[1]).toBe(54);
    expect(out[2]).toBe(54);
  });
});

describe('buildHueRotationColorMatrix', () => {
  it('leaves grey unchanged at any angle (rotation around the luma axis)', () => {
    const m = new Array<number>(20);
    // 70.7° ≈ 1.234 radians — same geometric rotation, now expressed in degrees
    buildHueRotationColorMatrix(m, 70.7);
    const out = applyTo(0x808080ff, m);
    expect(out[0]).toBe(128);
    expect(out[1]).toBe(128);
    expect(out[2]).toBe(128);
  });

  it('is identity at 0 degrees', () => {
    const m = new Array<number>(20);
    buildHueRotationColorMatrix(m, 0);
    const out = applyTo(0xc86432ff, m);
    expect(out[0]).toBe(200);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(50);
  });

  it('is identity at 360 degrees', () => {
    const m = new Array<number>(20);
    buildHueRotationColorMatrix(m, 360);
    const out = applyTo(0xc86432ff, m);
    expect(out[0]).toBeCloseTo(200, 0);
    expect(out[1]).toBeCloseTo(100, 0);
    expect(out[2]).toBeCloseTo(50, 0);
  });
});

describe('buildInvertColorMatrix', () => {
  it('inverts RGB and preserves alpha', () => {
    const m = new Array<number>(20);
    buildInvertColorMatrix(m);
    const out = applyTo(0xc83200ff, m); // R=200 G=50 B=0
    expect(out[0]).toBe(55);
    expect(out[1]).toBe(205);
    expect(out[2]).toBe(255);
    expect(out[3]).toBe(0xff);
  });
});

describe('buildSaturationColorMatrix', () => {
  it('amount 1 is identity', () => {
    const m = new Array<number>(20);
    buildSaturationColorMatrix(m, 1);
    const out = applyTo(0xc86432ff, m);
    expect(out[0]).toBe(200);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(50);
  });

  it('amount 0 equals grayscale', () => {
    const m = new Array<number>(20);
    buildSaturationColorMatrix(m, 0);
    const out = applyTo(0xff0000ff, m);
    expect(out[0]).toBe(54);
    expect(out[1]).toBe(54);
  });
});

describe('buildSepiaColorMatrix', () => {
  it('maps pure red to the sepia tone', () => {
    const m = new Array<number>(20);
    buildSepiaColorMatrix(m);
    const out = applyTo(0xff0000ff, m);
    expect(out[0]).toBe(100); // round(0.393 * 255)
    expect(out[1]).toBe(89); // round(0.349 * 255)
    expect(out[2]).toBe(69); // round(0.272 * 255)
  });
});

describe('concatColorMatrix', () => {
  it('composes two matrices (apply first, then second)', () => {
    const bright2 = new Array<number>(20);
    const half = new Array<number>(20);
    buildBrightnessColorMatrix(bright2, 2);
    buildBrightnessColorMatrix(half, 0.5);
    const out = new Array<number>(20);
    concatColorMatrix(out, bright2, half); // *2 then *0.5 = identity
    const pixel = applyTo(0xc86432ff, out);
    expect(pixel[0]).toBe(200);
    expect(pixel[1]).toBe(100);
    expect(pixel[2]).toBe(50);
  });

  it('carries the offset through composition', () => {
    const identity = new Array<number>(20);
    const invert = new Array<number>(20);
    setColorMatrixIdentity(identity);
    buildInvertColorMatrix(invert);
    const out = new Array<number>(20);
    concatColorMatrix(out, identity, invert);
    const pixel = applyTo(0xc80000ff, out); // R=200 -> 55
    expect(pixel[0]).toBe(55);
  });
});

describe('setColorMatrixIdentity', () => {
  it('leaves the pixel unchanged', () => {
    const m = new Array<number>(20);
    setColorMatrixIdentity(m);
    const out = applyTo(0xc86432ff, m);
    expect(out[0]).toBe(200);
    expect(out[1]).toBe(100);
    expect(out[2]).toBe(50);
    expect(out[3]).toBe(0xff);
  });
});
