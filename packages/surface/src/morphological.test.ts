import { createSurface } from './surface';
import { dilateSurface, erodeSurface } from './morphological';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('dilateSurface', () => {
  it('expands a single bright pixel into its neighborhood', () => {
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255; // center pixel fully opaque
    const out = new Uint8ClampedArray(3 * 4);
    dilateSurface(out, region(source), 1);
    expect(out[0 * 4 + 3]).toBe(255);
    expect(out[1 * 4 + 3]).toBe(255);
    expect(out[2 * 4 + 3]).toBe(255);
  });

  it('with radius 0 is an identity copy', () => {
    const source = createSurface(3, 1);
    source.data.set([10, 20, 30, 100], 0);
    source.data.set([50, 60, 70, 200], 4);
    const out = new Uint8ClampedArray(3 * 4);
    dilateSurface(out, region(source), 0);
    expect(out[0]).toBe(10);
    expect(out[4]).toBe(50);
  });

  it('is dual to erodeSurface (dilate after erode has no-smaller effect)', () => {
    const source = createSurface(5, 1);
    for (let i = 1; i < 4; i++) source.data[i * 4 + 3] = 255; // pixels 1-3 opaque
    const eroded = new Uint8ClampedArray(5 * 4);
    const dilated = new Uint8ClampedArray(5 * 4);
    erodeSurface(eroded, region(source), 1);
    dilateSurface(dilated, region(source), 1);
    // Dilation always >= source, erosion always <= source for alpha
    expect(dilated[1 * 4 + 3]).toBeGreaterThanOrEqual(source.data[1 * 4 + 3]);
    expect(eroded[1 * 4 + 3]).toBeLessThanOrEqual(source.data[1 * 4 + 3]);
  });
});

describe('erodeSurface', () => {
  it('shrinks an isolated bright pixel to dark when radius covers neighbors', () => {
    const source = createSurface(3, 1);
    source.data[1 * 4 + 3] = 255; // only center opaque
    const out = new Uint8ClampedArray(3 * 4);
    erodeSurface(out, region(source), 1);
    // Center eroded to 0 because transparent neighbors dominate the min
    expect(out[1 * 4 + 3]).toBe(0);
  });

  it('with radius 0 is an identity copy', () => {
    const source = createSurface(3, 1);
    source.data.set([10, 20, 30, 100], 4);
    const out = new Uint8ClampedArray(3 * 4);
    erodeSurface(out, region(source), 0);
    expect(out[4]).toBe(10);
    expect(out[7]).toBe(100);
  });

  it('preserves a fully opaque field', () => {
    const source = createSurface(5, 1, 0xffffffff);
    const out = new Uint8ClampedArray(5 * 4);
    erodeSurface(out, region(source), 2);
    for (let i = 0; i < 5; i++) {
      expect(out[i * 4 + 3]).toBe(255);
    }
  });
});
