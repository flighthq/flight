import { createSurface } from './surface';
import { mergeSurfaceChannels, splitSurfaceChannels } from './surfaceChannel';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';
import { createSurfaceRegion } from './surfaceRegion';

describe('mergeSurfaceChannels', () => {
  it('combines one channel from each input into the output', () => {
    const rSurf = createSurface(1, 1, 0xff000000); // R=0xff, G=0, B=0, A=0
    const gSurf = createSurface(1, 1, 0x00ff0000); // R=0, G=0xff, B=0, A=0
    const bSurf = createSurface(1, 1, 0x0000ff00); // R=0, G=0, B=0xff, A=0
    const aSurf = createSurface(1, 1, 0x000000ff); // R=0, G=0, B=0, A=0xff
    const out = createSurface(1, 1);
    mergeSurfaceChannels(
      createSurfaceRegion(out),
      createSurfaceRegion(rSurf),
      createSurfaceRegion(gSurf),
      createSurfaceRegion(bSurf),
      createSurfaceRegion(aSurf),
    );
    expect(getSurfacePixel(out, 0, 0)).toBe(0xff_ff_ff_ff);
  });

  it('uses the minimum dimension overlap', () => {
    const r = createSurface(3, 1, 0xff000000);
    const g = createSurface(3, 1, 0x00ff0000);
    const b = createSurface(3, 1, 0x0000ff00);
    const a = createSurface(3, 1, 0x000000ff);
    const out = createSurface(3, 1);
    // Restrict r region to width=1 — only pixel 0 should be written.
    mergeSurfaceChannels(
      createSurfaceRegion(out),
      { surface: r, x: 0, y: 0, width: 1, height: 1 },
      createSurfaceRegion(g),
      createSurfaceRegion(b),
      createSurfaceRegion(a),
    );
    // Pixel 0 is covered; pixel 1 should be untouched (0x00000000).
    expect((getSurfacePixel(out, 0, 0) >>> 24) & 0xff).toBe(0xff);
    expect(getSurfacePixel(out, 1, 0)).toBe(0x00000000);
  });
});

describe('splitSurfaceChannels', () => {
  it('returns four surfaces of the same dimensions', () => {
    const src = createSurface(3, 2, 0x112233ff);
    const [r, g, b, a] = splitSurfaceChannels(src);
    expect(r.width).toBe(3);
    expect(r.height).toBe(2);
    expect(g.width).toBe(3);
    expect(b.height).toBe(2);
    expect(a.width).toBe(3);
  });

  it('each channel surface is a grayscale copy of that channel', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0x11_22_33_44);
    const [r, g, b, a] = splitSurfaceChannels(src);
    // R surface: R=G=B=0x11, A=0xff.
    expect((getSurfacePixel(r, 0, 0) >>> 24) & 0xff).toBe(0x11);
    expect((getSurfacePixel(r, 0, 0) >> 16) & 0xff).toBe(0x11);
    expect((getSurfacePixel(r, 0, 0) >> 8) & 0xff).toBe(0x11);
    expect(getSurfacePixel(r, 0, 0) & 0xff).toBe(0xff);
    // G surface: R=G=B=0x22, A=0xff.
    expect((getSurfacePixel(g, 0, 0) >>> 24) & 0xff).toBe(0x22);
    // B surface: R=G=B=0x33, A=0xff.
    expect((getSurfacePixel(b, 0, 0) >>> 24) & 0xff).toBe(0x33);
    // A surface: R=G=B=A=0x44 (alpha stored in all channels for round-trip fidelity).
    expect((getSurfacePixel(a, 0, 0) >>> 24) & 0xff).toBe(0x44);
    expect(getSurfacePixel(a, 0, 0) & 0xff).toBe(0x44);
  });

  it('returns distinct surface objects', () => {
    const src = createSurface(2, 2, 0xffffffff);
    const [r, g, b, a] = splitSurfaceChannels(src);
    expect(r).not.toBe(src);
    expect(r).not.toBe(g);
    expect(g).not.toBe(b);
    expect(b).not.toBe(a);
  });

  it('round-trip: split then merge reconstructs the original', () => {
    const src = createSurface(2, 2);
    setSurfacePixel(src, 0, 0, 0xaabbccdd);
    setSurfacePixel(src, 1, 0, 0x11223344);
    const [r, g, b, a] = splitSurfaceChannels(src);
    const out = createSurface(2, 2);
    mergeSurfaceChannels(
      createSurfaceRegion(out),
      createSurfaceRegion(r),
      createSurfaceRegion(g),
      createSurfaceRegion(b),
      createSurfaceRegion(a),
    );
    expect(getSurfacePixel(out, 0, 0)).toBe(0xaabbccdd);
    expect(getSurfacePixel(out, 1, 0)).toBe(0x11223344);
  });
});
