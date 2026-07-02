import { createSurface } from './surface';
import { convolveSurface } from './surfaceConvolution';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('convolveSurface', () => {
  it('applies a convolution matrix to the source region', () => {
    const source = createSurface(3, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;
    const out = new Uint8ClampedArray(4);
    convolveSurface(out, region(source, 1, 0, 1, 1), {
      matrix: [1, 1, 1],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(20);
  });

  it("'clamp' edge mode (default) repeats the nearest edge pixel", () => {
    // 1px source, 3-wide kernel: all three samples hit the single source pixel
    const source = createSurface(1, 1, 0x606060ff);
    const out = new Uint8ClampedArray(4);
    convolveSurface(out, region(source), {
      matrix: [1, 1, 1],
      matrixX: 3,
      matrixY: 1,
      divisor: 3,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(0x60);
  });

  it("'mirror' edge mode reflects at boundaries", () => {
    // 3px source [10, 20, 30]. 5-wide kernel [1, 0, 0, 0, 0] picks 2 positions left.
    // For px=0, offsetX=2: rawSampleX = 0 + 0 + 0 - 2 = -2.
    // mirror(-2, 3) reflects to x=1 (value 20), while clamp(-2) gives x=0 (value 10).
    const source = createSurface(3, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;
    const out = new Uint8ClampedArray(3 * 4);
    convolveSurface(out, region(source), {
      edge: 'mirror',
      matrix: [1, 0, 0, 0, 0],
      matrixX: 5,
      matrixY: 1,
      divisor: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(20);
  });

  it("'transparent' edge mode treats out-of-bounds as transparent black", () => {
    // 1px source (opaque black), 3-wide kernel [1, 0, 0] — leftmost sample
    // is out of bounds and contributes transparent black (all zeros).
    const source = createSurface(1, 1, 0x000000ff);
    const out = new Uint8ClampedArray(4);
    convolveSurface(out, region(source), {
      edge: 'transparent',
      divisor: 1,
      matrix: [1, 0, 0],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(0);
    expect(out[3]).toBe(0);
  });

  it("'wrap' edge mode tiles the source toroidally", () => {
    // 3px source [10, 20, 30]. The leftmost kernel position for px=0 wraps to px=2.
    const source = createSurface(3, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;
    const out = new Uint8ClampedArray(3 * 4);
    convolveSurface(out, region(source), {
      edge: 'wrap',
      matrix: [1, 0, 0], // picks left neighbor only
      matrixX: 3,
      matrixY: 1,
      divisor: 1,
      preserveAlpha: false,
    });
    // px=0 left neighbor wraps to px=2 → value 30
    expect(out[0]).toBe(30);
  });

  it('preserves source alpha by default', () => {
    const source = createSurface(1, 1, 0x00000044);
    const out = new Uint8ClampedArray(4);
    convolveSurface(out, region(source), {
      bias: 255,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });
    expect(out[3]).toBe(0x44);
  });

  it('throws when matrix dimensions are not positive', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => convolveSurface(out, region(source), { matrix: [], matrixX: 0, matrixY: 1 })).toThrow();
  });

  it('throws when matrix is too short for its declared dimensions', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    expect(() => convolveSurface(out, region(source), { matrix: [1], matrixX: 3, matrixY: 3 })).toThrow();
  });

  it('treats an explicit divisor of 0 as passthrough (no division by zero)', () => {
    const source = createSurface(1, 1, 0x804020ff);
    const out = new Uint8ClampedArray(4);
    convolveSurface(out, region(source), {
      divisor: 0,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
      preserveAlpha: false,
    });
    expect(out[0]).toBe(0x80);
  });
});
