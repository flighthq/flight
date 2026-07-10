import { getSurfacePixel } from '@flighthq/surface';
import type { GlyphEntry, GlyphRasterizedBitmap, GlyphRasterizerBackend } from '@flighthq/types';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas, getGlyphAtlasSurface } from './glyphAtlas';
import { getGlyphAtlasEntry } from './glyphAtlasEntry';
import { setGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('getGlyphAtlasEntry', () => {
  afterEach(() => setGlyphRasterizerBackend(null));

  it('rasterizes a missing glyph once and caches it', () => {
    const { backend, calls } = createMockRasterizerBackend();
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, width: 256 });

    const first = getGlyphAtlasEntry(atlas, 65);
    const second = getGlyphAtlasEntry(atlas, 65);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(calls).toEqual([65]);
  });

  it('passes the rasterized size, advance, and bearing through to the entry', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 10, width: cp === 65 ? 12 : 6 }));
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, width: 256 });

    const entry = getGlyphAtlasEntry(atlas, 65)!;

    expect(entry.width).toBe(12);
    expect(entry.height).toBe(10);
    expect(entry.advance).toBe(12);
    expect(entry.bearingX).toBe(1);
    expect(entry.bearingY).toBe(10);
  });

  it('places different glyphs in non-overlapping, in-bounds rects', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 8 + (cp % 5), width: 8 + (cp % 7) }));
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, width: 256 });
    const surface = getGlyphAtlasSurface(atlas);

    const entries: GlyphEntry[] = [];
    for (let cp = 65; cp < 75; cp++) entries.push(getGlyphAtlasEntry(atlas, cp)!);

    for (const entry of entries) {
      expect(entry.x).toBeGreaterThanOrEqual(0);
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.x + entry.width).toBeLessThanOrEqual(surface.width);
      expect(entry.y + entry.height).toBeLessThanOrEqual(surface.height);
    }
    expectNoOverlap(entries);
  });

  it('blits the glyph pixels into the atlas surface at the entry rect', () => {
    const { backend } = createMockRasterizerBackend();
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, width: 256 });
    const surface = getGlyphAtlasSurface(atlas);

    const entry = getGlyphAtlasEntry(atlas, 0x41)!;
    const corner = getSurfacePixel(surface, entry.x, entry.y);
    const inside = getSurfacePixel(surface, entry.x + 2, entry.y + 2);

    // The mock fills every glyph pixel with (R = codepoint & 0xff, G = 0x80, B = 0x40, A = 0xff).
    expect((corner >>> 24) & 0xff).toBe(0x41);
    expect((corner >>> 16) & 0xff).toBe(0x80);
    expect((corner >>> 8) & 0xff).toBe(0x40);
    expect(corner & 0xff).toBe(0xff);
    expect(inside).toBe(corner);
  });

  it('evicts the least-recently-used glyph past the glyph budget and re-rasterizes it on demand', () => {
    const { backend, calls } = createMockRasterizerBackend();
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, maxGlyphs: 2, width: 256 });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 65); // touch 65 so 66 becomes least-recently-used
    getGlyphAtlasEntry(atlas, 67); // over budget -> evicts 66
    expect(calls).toEqual([65, 66, 67]);

    getGlyphAtlasEntry(atlas, 65); // still cached -> no re-rasterize
    expect(calls).toEqual([65, 66, 67]);

    getGlyphAtlasEntry(atlas, 66); // evicted -> re-rasterizes
    expect(calls).toEqual([65, 66, 67, 66]);
  });

  it('keeps rects non-overlapping after eviction and repack', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 8 + (cp % 6), width: 8 + (cp % 4) }));
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, maxGlyphs: 4, width: 256 });

    // Add eight glyphs through a four-glyph budget: each of the last four insertions evicts an older
    // glyph and repacks. The four most-recent codepoints stay cached, so re-requesting them are pure
    // hits that return their stable post-repack positions.
    for (let cp = 65; cp < 73; cp++) getGlyphAtlasEntry(atlas, cp);
    const surviving: GlyphEntry[] = [];
    for (let cp = 69; cp < 73; cp++) surviving.push(getGlyphAtlasEntry(atlas, cp)!);

    expect(surviving).toHaveLength(4);
    expectNoOverlap(surviving);
  });

  it('returns null for a single glyph larger than the whole atlas', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 200, width: 200 }));
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 64, width: 64 });

    expect(getGlyphAtlasEntry(atlas, 65)).toBeNull();
  });

  it('returns null when the rasterizer produces nothing', () => {
    const backend: GlyphRasterizerBackend = { rasterize: () => null };
    setGlyphRasterizerBackend(backend);
    const atlas = createGlyphAtlas({ fontFamily: 'mock', fontSize: 16, height: 256, width: 256 });

    expect(getGlyphAtlasEntry(atlas, 65)).toBeNull();
  });
});

function createMockRasterizerBackend(
  sizeFor: (codepoint: number) => { width: number; height: number } = () => ({ height: 8, width: 8 }),
): { backend: GlyphRasterizerBackend; calls: number[] } {
  const calls: number[] = [];
  const backend: GlyphRasterizerBackend = {
    rasterize(codepoint): GlyphRasterizedBitmap {
      calls.push(codepoint);
      const { width, height } = sizeFor(codepoint);
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = codepoint & 0xff;
        pixels[i * 4 + 1] = 0x80;
        pixels[i * 4 + 2] = 0x40;
        pixels[i * 4 + 3] = 0xff;
      }
      return { advance: width, bearingX: 1, bearingY: height, height, pixels, width };
    },
  };
  return { backend, calls };
}

function expectNoOverlap(entries: readonly Readonly<GlyphEntry>[]): void {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const overlaps = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps).toBe(false);
    }
  }
}
