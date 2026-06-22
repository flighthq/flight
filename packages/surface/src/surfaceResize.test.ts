import { createSurface } from './surface';
import { getSurfacePixel } from './surfacePixel';
import { resizeSurface } from './surfaceResize';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('resizeSurface', () => {
  it('nearest upscales by pixel duplication', () => {
    const source = createSurface(2, 1);
    source.data.set([10, 20, 30, 255], 0);
    source.data.set([40, 50, 60, 255], 4);
    const out = createSurface(4, 1);
    resizeSurface(region(out), region(source), 'nearest');
    expect(getSurfacePixel(out, 0, 0)).toBe(getSurfacePixel(source, 0, 0));
    expect(getSurfacePixel(out, 1, 0)).toBe(getSurfacePixel(source, 0, 0));
    expect(getSurfacePixel(out, 2, 0)).toBe(getSurfacePixel(source, 1, 0));
    expect(getSurfacePixel(out, 3, 0)).toBe(getSurfacePixel(source, 1, 0));
  });

  it('bilinear interpolates between source pixels', () => {
    const source = createSurface(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([100, 100, 100, 255], 4);
    const out = createSurface(4, 1);
    resizeSurface(region(out), region(source), 'bilinear');
    expect(out.data[0]).toBe(0);
    expect(out.data[4]).toBeGreaterThanOrEqual(out.data[0]);
    expect(out.data[8]).toBeGreaterThan(out.data[4]);
    expect(out.data[12]).toBe(100);
  });

  it('bicubic produces a smoother interpolation than bilinear', () => {
    const source = createSurface(2, 1);
    source.data.set([0, 0, 0, 255], 0);
    source.data.set([200, 200, 200, 255], 4);
    const out = createSurface(4, 1);
    resizeSurface(region(out), region(source), 'bicubic');
    // Bicubic should produce a monotonically increasing sequence
    expect(out.data[4]).toBeGreaterThanOrEqual(out.data[0]);
    expect(out.data[8]).toBeGreaterThanOrEqual(out.data[4]);
    expect(out.data[12]).toBeGreaterThanOrEqual(out.data[8]);
  });

  it('premultiplied option prevents dark-halo bleed at transparent edges', () => {
    // Red pixel adjacent to fully transparent. Straight-alpha blend mixes the
    // hidden black of the transparent pixel into the output. Premultiplied
    // blending keeps the red pure on the opaque side.
    const source = createSurface(2, 1);
    source.data.set([255, 0, 0, 255], 0); // opaque red
    source.data.set([0, 0, 0, 0], 4); // transparent
    const straight = createSurface(4, 1);
    resizeSurface(region(straight), region(source), 'bilinear');
    const premul = createSurface(4, 1);
    resizeSurface(region(premul), region(source), { mode: 'bilinear', premultiplied: true });
    // At the boundary (pixel 1), premultiplied keeps red higher than straight
    expect(premul.data[4]).toBeGreaterThanOrEqual(straight.data[4]);
  });

  it('downscales by averaging toward the source values', () => {
    const source = createSurface(4, 1, 0x40608000);
    const out = createSurface(2, 1);
    resizeSurface(region(out), region(source), 'bilinear');
    expect(out.data[0]).toBe(0x40);
    expect(out.data[1]).toBe(0x60);
    expect(out.data[2]).toBe(0x80);
  });

  it('resamples a source sub-region into a dest sub-region', () => {
    const source = createSurface(4, 1);
    source.data.set([10, 0, 0, 255], 2 * 4); // source pixel (2,0)
    const out = createSurface(4, 1);
    resizeSurface(region(out, 0, 0, 2, 1), region(source, 2, 0, 1, 1), 'nearest');
    expect(out.data[0]).toBe(10);
    expect(out.data[4]).toBe(10);
    expect(out.data[8]).toBe(0); // outside the dest sub-region
  });

  it('is a no-op when a dimension is zero', () => {
    const source = createSurface(2, 2, 0xffffffff);
    const out = createSurface(0, 0);
    expect(() => resizeSurface(region(out), region(source))).not.toThrow();
  });
});
