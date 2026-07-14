import { createSurface } from './surface';
import { extractSurfacePixels } from './surfaceComposite';
import { drawSurface } from './surfaceDraw';
import { setSurfacePixel } from './surfacePixel';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

function readExtractedPixel(buf: Uint8ClampedArray, regionWidth: number, x: number, y: number): number {
  const i = (y * regionWidth + x) * 4;
  return ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
}

describe('drawSurface', () => {
  it('does not throw when drawing onto a canvas', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawSurface(canvas, region(src), 0, 0)).not.toThrow();
  });

  it('does not throw when drawing at an offset', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    expect(() => drawSurface(canvas, region(src), 2, 2)).not.toThrow();
  });

  it('extracts correct pixels from a filled source', () => {
    const src = createSurface(4, 4, 0xff0000ff);
    const r = region(src);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractSurfacePixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0xff0000ff);
    expect(readExtractedPixel(buf, r.width, 3, 3)).toBe(0xff0000ff);
  });

  it('extracts correct pixels from a sub-region', () => {
    const src = createSurface(4, 4);
    setSurfacePixel(src, 1, 1, 0xaabbccdd);
    setSurfacePixel(src, 2, 2, 0x11223344);
    const r = region(src, 1, 1, 2, 2);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractSurfacePixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0xaabbccdd);
    expect(readExtractedPixel(buf, r.width, 1, 1)).toBe(0x11223344);
  });

  it('extracts zeroes from an empty surface', () => {
    const src = createSurface(2, 2);
    const r = region(src);
    const buf = new Uint8ClampedArray(r.width * r.height * 4);
    extractSurfacePixels(buf, r);
    expect(readExtractedPixel(buf, r.width, 0, 0)).toBe(0x00000000);
    expect(readExtractedPixel(buf, r.width, 1, 1)).toBe(0x00000000);
  });

  it('is a no-op for a zero-dimension region', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    expect(() => drawSurface(canvas, region(src, 0, 0, 0, 0), 0, 0)).not.toThrow();
  });
});
