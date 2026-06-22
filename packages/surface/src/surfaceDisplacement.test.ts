import { createSurface } from './surface';
import { displaceSurface } from './surfaceDisplacement';

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

describe('displaceSurface', () => {
  it('is a no-op copy when scaleX and scaleY are 0', () => {
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data.fill(128);
    const out = new Uint8ClampedArray(3 * 4);
    displaceSurface(out, region(source), { map: region(map), scaleX: 0, scaleY: 0, mode: 'clamp' });
    // With zero scale, every output pixel samples from its exact position.
    expect(out[0]).toBe(255); // px0 = red
    expect(out[4 + 1]).toBe(255); // px1 = green
    expect(out[8 + 2]).toBe(255); // px2 = blue
  });

  it('shifts the sample position by the scaled map displacement', () => {
    // map value 255 → dx = (255/255 - 0.5) * 2 = +1.0 exactly; scaleX=2.
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data[0] = 255;
    map.data[4] = 255;
    map.data[8] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    displaceSurface(out, region(source), {
      map: region(map),
      componentX: 0,
      scaleX: 2,
      scaleY: 0,
      mode: 'clamp',
    });
    // px0←src1 (green), px1←src2 (blue), px2←src3 oob clamped to src2 (blue)
    expect(out[1]).toBe(255); // green channel of px0
    expect(out[4 + 2]).toBe(255); // blue channel of px1
    expect(out[8 + 2]).toBe(255); // blue channel of px2 (clamped)
  });

  it("'color' mode fills out-of-range samples with fillColor", () => {
    // Map value 255 with scaleX=4 → dx=+2; px2 samples at x=4 (oob)
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data.fill(255);
    const out = new Uint8ClampedArray(3 * 4);
    displaceSurface(out, region(source), {
      map: region(map),
      scaleX: 4,
      scaleY: 0,
      mode: 'color',
      fillColor: 0xff00ffff,
    });
    // px2 displaces to x=4 (out of range) → magenta fill
    expect(out[2 * 4 + 0]).toBe(0xff);
    expect(out[2 * 4 + 1]).toBe(0);
    expect(out[2 * 4 + 2]).toBe(0xff);
    expect(out[2 * 4 + 3]).toBe(255);
  });

  it("'ignore' mode keeps the undisplaced source pixel for out-of-range samples", () => {
    // Map value 255 with scaleX=4 → px2 samples at x=4 (oob) → keep blue
    const source = rgbStrip();
    const map = createSurface(3, 1);
    map.data.fill(255);
    const out = new Uint8ClampedArray(3 * 4);
    displaceSurface(out, region(source), {
      map: region(map),
      scaleX: 4,
      scaleY: 0,
      mode: 'ignore',
    });
    // px2 displaces out of range → keeps src2 (blue) unchanged
    expect(out[2 * 4 + 2]).toBe(255);
    expect(out[2 * 4 + 3]).toBe(255);
  });

  it('samples through the source region offset', () => {
    // 4px [red, green, blue, white]; zero displacement over region (1,0,2,1) copies
    // source pixels 1 and 2 (green, blue), proving the offset is applied.
    const source = createSurface(4, 1);
    source.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);
    const map = createSurface(2, 1);
    map.data.fill(128); // neutral — minimal displacement at scale=0
    const out = new Uint8ClampedArray(2 * 4);
    displaceSurface(out, region(source, 1, 0, 2, 1), {
      map: region(map),
      scaleX: 0,
      scaleY: 0,
    });
    expect(out[1]).toBe(255); // green from source[1]
    expect(out[4 + 2]).toBe(255); // blue from source[2]
  });
});
