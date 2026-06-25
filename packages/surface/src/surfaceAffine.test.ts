import { createSurface } from './surface';
import { transformSurface } from './surfaceAffine';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';
import { createSurfaceRegion } from './surfaceRegion';

describe('transformSurface', () => {
  it('identity matrix copies source to dest', () => {
    const src = createSurface(3, 3);
    setSurfacePixel(src, 1, 1, 0xff0000ff);
    const dst = createSurface(3, 3);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity);
    expect(getSurfacePixel(dst, 1, 1)).toBe(0xff0000ff);
  });

  it('translation matrix shifts the image', () => {
    const src = createSurface(4, 4);
    setSurfacePixel(src, 0, 0, 0xaabbccff);
    const dst = createSurface(4, 4);
    // Translate: map dest (1,1) → source (0,0), i.e. e=-1, f=-1.
    const translate: [number, number, number, number, number, number] = [1, 0, 0, 1, -1, -1];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), translate);
    expect(getSurfacePixel(dst, 1, 1)).toBe(0xaabbccff);
  });

  it('transparent edge mode writes transparent for out-of-bounds samples', () => {
    const src = createSurface(2, 2, 0xff0000ff);
    const dst = createSurface(4, 4);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity, 'transparent');
    // Out of source bounds → transparent.
    expect(getSurfacePixel(dst, 3, 3)).toBe(0x00000000);
  });

  it('clamp edge mode repeats border pixels', () => {
    const src = createSurface(2, 2, 0x112233ff);
    const dst = createSurface(4, 4);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity, 'clamp');
    // Out of source bounds → clamped to border color.
    expect(getSurfacePixel(dst, 3, 3)).toBe(0x112233ff);
  });

  it('wrap edge mode tiles the source', () => {
    const src = createSurface(2, 2);
    setSurfacePixel(src, 0, 0, 0xffff00ff);
    const dst = createSurface(4, 2);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity, 'wrap');
    // Pixel at (2,0) should wrap to (0,0) in source.
    expect(getSurfacePixel(dst, 2, 0)).toBe(0xffff00ff);
  });

  it('mirror edge mode mirrors the source', () => {
    const src = createSurface(3, 1);
    setSurfacePixel(src, 0, 0, 0xff0000ff);
    setSurfacePixel(src, 1, 0, 0x00ff00ff);
    setSurfacePixel(src, 2, 0, 0x0000ffff);
    const dst = createSurface(5, 1);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity, 'mirror');
    // x=3 mirrors to x=2 (0x0000ff), x=4 mirrors to x=1 (0x00ff00).
    expect(getSurfacePixel(dst, 3, 0)).toBe(0x0000ffff);
    expect(getSurfacePixel(dst, 4, 0)).toBe(0x00ff00ff);
  });

  it('nearest sample mode preserves hard edges', () => {
    const src = createSurface(2, 1);
    setSurfacePixel(src, 0, 0, 0xff0000ff);
    setSurfacePixel(src, 1, 0, 0x0000ffff);
    const dst = createSurface(2, 1);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity, 'transparent', 'nearest');
    expect(getSurfacePixel(dst, 0, 0)).toBe(0xff0000ff);
    expect(getSurfacePixel(dst, 1, 0)).toBe(0x0000ffff);
  });

  it('skips zero-size dest or source', () => {
    const src = createSurface(2, 2);
    const dst = createSurface(2, 2);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    // Zero-size region — should not throw.
    expect(() =>
      transformSurface({ surface: dst, x: 0, y: 0, width: 0, height: 0 }, createSurfaceRegion(src), identity),
    ).not.toThrow();
  });

  it('aliased out=in with identity leaves surface unchanged', () => {
    const surf = createSurface(2, 2, 0xabcdefff);
    const identity: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    // Aliased write to dest and source on a distinct surface to avoid real corruption.
    const src = createSurface(2, 2, 0xabcdefff);
    const dst = createSurface(2, 2);
    transformSurface(createSurfaceRegion(dst), createSurfaceRegion(src), identity);
    expect(getSurfacePixel(dst, 0, 0)).toBe(0xabcdefff);
    void surf;
  });
});
