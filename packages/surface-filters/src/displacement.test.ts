import { createSurface } from '@flighthq/surface/surface';

import { applySurfaceDisplacementMapFilter } from './displacement';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

// A 3x1 strip: red | green | blue.
function rgbStrip() {
  const s = createSurface(3, 1);
  s.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  return s;
}

describe('applySurfaceDisplacementMapFilter', () => {
  it('is an identity copy when the map is neutral (128)', () => {
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data.fill(128);
    const out = new Uint8ClampedArray(3 * 4);
    applySurfaceDisplacementMapFilter(out, region(source), { map: region(map), scaleX: 256, scaleY: 256 });
    expect(Array.from(out)).toEqual(Array.from(source.data));
  });

  it('shifts the sample position by the scaled map displacement', () => {
    const source = rgbStrip();
    const map = createSurface(3, 1);
    // R channel = 129 everywhere → dx = (129-128)*256/256 = +1. G stays 0 but scaleY=0.
    map.data[0] = 129;
    map.data[4] = 129;
    map.data[8] = 129;
    const out = new Uint8ClampedArray(3 * 4);
    applySurfaceDisplacementMapFilter(out, region(source), {
      map: region(map),
      componentX: 0,
      scaleX: 256,
      scaleY: 0,
      mode: 'clamp',
    });
    // px0←src1 (green), px1←src2 (blue), px2←src3 oob clamped to src2 (blue)
    expect(Array.from(out)).toEqual([0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  });

  it("'color' mode fills out-of-range samples with the fill color", () => {
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data[0] = 129;
    map.data[4] = 129;
    map.data[8] = 129;
    const out = new Uint8ClampedArray(3 * 4);
    applySurfaceDisplacementMapFilter(out, region(source), {
      map: region(map),
      scaleX: 256,
      scaleY: 0,
      mode: 'color',
      color: 0xff00ff,
      alpha: 1,
    });
    // px2 displaces to x=3 (out of range) → magenta fill
    expect(out[2 * 4 + 0]).toBe(0xff);
    expect(out[2 * 4 + 1]).toBe(0);
    expect(out[2 * 4 + 2]).toBe(0xff);
    expect(out[2 * 4 + 3]).toBe(255);
  });

  it("'ignore' mode keeps the undisplaced source pixel for out-of-range samples", () => {
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data[0] = 129;
    map.data[4] = 129;
    map.data[8] = 129;
    const out = new Uint8ClampedArray(3 * 4);
    applySurfaceDisplacementMapFilter(out, region(source), {
      map: region(map),
      scaleX: 256,
      scaleY: 0,
      mode: 'ignore',
    });
    // px2 displaces out of range → keeps src2 (blue) unchanged
    expect(out[2 * 4 + 2]).toBe(255);
    expect(out[2 * 4 + 3]).toBe(255);
  });
});
