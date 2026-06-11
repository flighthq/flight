import { createSurface } from '@flighthq/surface';

import { applySurfaceGradientBevelFilter, applySurfaceGradientGlowFilter, buildSurfaceGradientRamp } from './gradient';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('applySurfaceGradientBevelFilter', () => {
  it('maps the signed edge gradient through the ramp', () => {
    // 5x1 edge: transparent x2 | opaque x3. Shadow ramp at index 0 (black),
    // transparent middle at 128, highlight white at 255.
    const source = createSurface(5, 1);
    for (let x = 2; x < 5; x++) source.data[x * 4 + 3] = 255;
    const ramp = new Uint8ClampedArray(256 * 4);
    buildSurfaceGradientRamp(ramp, [0x000000, 0x808080, 0xffffff], [1, 0, 1], [0, 128, 255]);
    const out = new Uint8ClampedArray(5 * 4);
    const scratch = new Uint8ClampedArray(5 * 4);
    applySurfaceGradientBevelFilter(out, scratch, region(source), ramp, {
      angle: Math.PI,
      distance: 1,
      radiusX: 1,
      radiusY: 0,
      type: 'both',
    });
    // Light-facing edge (x2) is on the highlight half of the ramp → bright.
    expect(out[2 * 4 + 0]).toBeGreaterThan(150);
    expect(out[2 * 4 + 3]).toBeGreaterThan(0);
    // Far edge (x4) maps to ramp index 0 → opaque black shadow.
    expect(out[4 * 4 + 0]).toBe(0);
    expect(out[4 * 4 + 3]).toBe(255);
  });
});

describe('applySurfaceGradientGlowFilter', () => {
  it('indexes the ramp by the blurred alpha', () => {
    // ramp: index 0 transparent green, 255 opaque green.
    const ramp = new Uint8ClampedArray(256 * 4);
    buildSurfaceGradientRamp(ramp, [0x00ff00, 0x00ff00], [0, 1], [0, 255]);
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGradientGlowFilter(out, scratch, region(source), ramp, { radiusX: 0, radiusY: 0 });
    // Full alpha (255) → ramp[255] = opaque green.
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0xff);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(255);
  });

  it('scales the ramp alpha by intensity', () => {
    const ramp = new Uint8ClampedArray(256 * 4);
    buildSurfaceGradientRamp(ramp, [0x00ff00, 0x00ff00], [1, 1], [0, 255]);
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGradientGlowFilter(out, scratch, region(source), ramp, { radiusX: 0, radiusY: 0, intensity: 0.5 });
    expect(out[3]).toBe(128);
  });

  it('source.surface.data can be used as out for a full-surface region', () => {
    const ramp = new Uint8ClampedArray(256 * 4);
    buildSurfaceGradientRamp(ramp, [0x00ff00, 0x00ff00], [0, 1], [0, 255]);
    const surface = createSurface(1, 1, 0xffffffff);
    const scratch = new Uint8ClampedArray(4);
    applySurfaceGradientGlowFilter(surface.data, scratch, region(surface), ramp, { radiusX: 0, radiusY: 0 });
    expect(surface.data[1]).toBe(0xff);
    expect(surface.data[3]).toBe(255);
  });
});

describe('buildSurfaceGradientRamp', () => {
  it('places endpoints exactly and interpolates the middle', () => {
    const ramp = new Uint8ClampedArray(256 * 4);
    buildSurfaceGradientRamp(ramp, [0xff0000, 0x0000ff], [0, 1], [0, 255]);
    expect(Array.from(ramp.subarray(0, 4))).toEqual([255, 0, 0, 0]);
    expect(Array.from(ramp.subarray(255 * 4, 256 * 4))).toEqual([0, 0, 255, 255]);
    expect(Array.from(ramp.subarray(128 * 4, 129 * 4))).toEqual([127, 0, 128, 128]);
  });

  it('zero-fills when there are no stops', () => {
    const ramp = new Uint8ClampedArray(256 * 4).fill(99);
    buildSurfaceGradientRamp(ramp, [], [], []);
    expect(ramp.every((v) => v === 0)).toBe(true);
  });
});
