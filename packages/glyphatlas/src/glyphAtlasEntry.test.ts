import { getBitmapPixel } from '@flighthq/bitmap/contract';
import type { GlyphEntry, GlyphRasterizedBitmap, GlyphRasterizerBackend } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createGlyphAtlas, getGlyphAtlasBitmap } from './glyphAtlas';
import { getGlyphAtlasEntry, setGlyphAtlasEntryGuard } from './glyphAtlasEntry';
import { createStubGlyphRasterizerBackend } from './glyphRasterizerBackend';

describe('getGlyphAtlasEntry', () => {
  it('produces a non-blank glyph in a headless env with the stub backend (issue #8)', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'unavailable',
      fontSize: 32,
      height: 256,
      rasterizerBackend: createStubGlyphRasterizerBackend(),
      width: 256,
    });

    const entry = getGlyphAtlasEntry(atlas, 0x41)!;
    expect(entry).not.toBeNull();
    expect(entry.width).toBeGreaterThan(0);
    expect(entry.height).toBeGreaterThan(0);

    const bitmap = getGlyphAtlasBitmap(atlas);
    const inside = getBitmapPixel(bitmap, entry.x + 1, entry.y + 1);
    expect(inside & 0xff).toBe(0xff);
  });

  it('rasterizes a missing glyph once and caches it', () => {
    const { backend, calls } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });

    const first = getGlyphAtlasEntry(atlas, 65);
    const second = getGlyphAtlasEntry(atlas, 65);

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(calls).toEqual([65]);
  });

  it('passes the rasterized size, advance, and bearing through to the entry', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 10, width: cp === 65 ? 12 : 6 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });

    const entry = getGlyphAtlasEntry(atlas, 65)!;

    expect(entry.width).toBe(12);
    expect(entry.height).toBe(10);
    expect(entry.advance).toBe(12);
    expect(entry.bearingX).toBe(1);
    expect(entry.bearingY).toBe(10);
    expect(entry.page).toBe(0); // The dynamic atlas is a single growing page.
  });

  it('places different glyphs in non-overlapping, in-bounds rects', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 8 + (cp % 5), width: 8 + (cp % 7) }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });
    const bitmap = getGlyphAtlasBitmap(atlas);

    const entries: GlyphEntry[] = [];
    for (let cp = 65; cp < 75; cp++) entries.push(getGlyphAtlasEntry(atlas, cp)!);

    for (const entry of entries) {
      expect(entry.x).toBeGreaterThanOrEqual(0);
      expect(entry.y).toBeGreaterThanOrEqual(0);
      expect(entry.x + entry.width).toBeLessThanOrEqual(bitmap.width);
      expect(entry.y + entry.height).toBeLessThanOrEqual(bitmap.height);
    }
    expectNoOverlap(entries);
  });

  it('blits the glyph pixels into the atlas bitmap at the entry rect', () => {
    const { backend } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });
    const bitmap = getGlyphAtlasBitmap(atlas);

    const entry = getGlyphAtlasEntry(atlas, 0x41)!;
    const corner = getBitmapPixel(bitmap, entry.x, entry.y);
    const inside = getBitmapPixel(bitmap, entry.x + 2, entry.y + 2);

    expect((corner >>> 24) & 0xff).toBe(0x41);
    expect((corner >>> 16) & 0xff).toBe(0x80);
    expect((corner >>> 8) & 0xff).toBe(0x40);
    expect(corner & 0xff).toBe(0xff);
    expect(inside).toBe(corner);
  });

  it('evicts the least-recently-used glyph past the glyph budget and re-rasterizes it on demand', () => {
    const { backend, calls } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxGlyphs: 2,
      rasterizerBackend: backend,
      width: 256,
    });

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

  it('evicts strictly oldest-first after interleaved touches', () => {
    const { backend, calls } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxGlyphs: 3,
      rasterizerBackend: backend,
      width: 256,
    });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 67);
    getGlyphAtlasEntry(atlas, 66); // order is now 65, 67, 66
    getGlyphAtlasEntry(atlas, 65); // order is now 67, 66, 65
    expect(calls).toEqual([65, 66, 67]);

    getGlyphAtlasEntry(atlas, 68); // evicts 67, the true oldest
    expect(calls).toEqual([65, 66, 67, 68]);

    getGlyphAtlasEntry(atlas, 66); // still cached
    getGlyphAtlasEntry(atlas, 65); // still cached
    expect(calls).toEqual([65, 66, 67, 68]);

    getGlyphAtlasEntry(atlas, 67); // evicted earlier -> re-rasterizes
    expect(calls).toEqual([65, 66, 67, 68, 67]);
  });

  it('places a re-rasterized glyph at the most-recently-used end', () => {
    const { backend, calls } = createMockRasterizerBackend();
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxGlyphs: 2,
      rasterizerBackend: backend,
      width: 256,
    });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 67); // evicts 65
    getGlyphAtlasEntry(atlas, 65); // re-rasterized, evicts 66, and is now newest
    expect(calls).toEqual([65, 66, 67, 65]);

    getGlyphAtlasEntry(atlas, 68); // evicts 67, not the just-re-added 65
    getGlyphAtlasEntry(atlas, 65);
    expect(calls).toEqual([65, 66, 67, 65, 68]);
  });

  it('keeps rects non-overlapping after eviction and repack', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 8 + (cp % 6), width: 8 + (cp % 4) }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxGlyphs: 4,
      rasterizerBackend: backend,
      width: 256,
    });

    for (let cp = 65; cp < 73; cp++) getGlyphAtlasEntry(atlas, cp);
    const surviving: GlyphEntry[] = [];
    for (let cp = 69; cp < 73; cp++) surviving.push(getGlyphAtlasEntry(atlas, cp)!);

    expect(surviving).toHaveLength(4);
    expectNoOverlap(surviving);
  });

  it('returns null for a single glyph larger than the whole atlas', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 200, width: 200 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backend,
      width: 64,
    });

    expect(getGlyphAtlasEntry(atlas, 65)).toBeNull();
  });

  it('returns null when the rasterizer produces nothing', () => {
    const backend: GlyphRasterizerBackend = { rasterize: () => null };
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });

    expect(getGlyphAtlasEntry(atlas, 65)).toBeNull();
  });

  it('preserves the advance of a present glyph with no ink', () => {
    const backend: GlyphRasterizerBackend = {
      rasterize: () => ({
        advance: 5,
        bearingX: 0,
        bearingY: 0,
        height: 0,
        pixels: new Uint8ClampedArray(),
        width: 0,
      }),
    };
    const atlas = createGlyphAtlas({
      fontFamily: 'embedded',
      fontSize: 16,
      height: 64,
      rasterizerBackend: backend,
      width: 64,
    });

    expect(getGlyphAtlasEntry(atlas, 0x20)).toMatchObject({ advance: 5, height: 0, width: 0 });
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

describe('repack layout version', () => {
  it('bumps once per repack the packer performs', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 8, width: 8 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 8,
      height: 32,
      padding: 1,
      rasterizerBackend: backend,
      width: 32,
    });

    for (let cp = 65; cp < 74; cp++) getGlyphAtlasEntry(atlas, cp);
    expect(atlas.runtime.layoutVersion).toBe(0);

    getGlyphAtlasEntry(atlas, 74);
    expect(atlas.runtime.layoutVersion).toBe(1);
    getGlyphAtlasEntry(atlas, 75);
    expect(atlas.runtime.layoutVersion).toBe(2);
  });

  it('does not bump for an eviction that no repack follows', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 8, width: 8 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 8,
      height: 256,
      maxGlyphs: 2,
      rasterizerBackend: backend,
      width: 256,
    });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 67);

    expect(atlas.runtime.entries.size).toBe(2);
    expect(atlas.runtime.layoutVersion).toBe(0);
  });

  it('bumps even when a survivor lands back on its own coordinates', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 8, width: 8 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 8,
      height: 32,
      padding: 1,
      rasterizerBackend: backend,
      width: 32,
    });

    for (let cp = 65; cp < 74; cp++) getGlyphAtlasEntry(atlas, cp);
    for (let cp = 65; cp < 73; cp++) getGlyphAtlasEntry(atlas, cp);
    const survivor = getGlyphAtlasEntry(atlas, 65)!;
    const x = survivor.x;
    const y = survivor.y;

    getGlyphAtlasEntry(atlas, 74);

    expect(survivor.x).toBe(x);
    expect(survivor.y).toBe(y);
    expect(atlas.runtime.layoutVersion).toBe(1);
  });
});

describe('retained-byte and area budgets', () => {
  it('evicts to stay within the retained-byte budget', () => {
    const { backend, calls } = createMockRasterizerBackend(() => ({ height: 10, width: 10 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxBytes: 900,
      rasterizerBackend: backend,
      width: 256,
    });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 67);

    expect(atlas.runtime.entries.size).toBe(2);
    expect(atlas.runtime.retainedBytes).toBeLessThanOrEqual(900);
    getGlyphAtlasEntry(atlas, 65);
    expect(calls).toEqual([65, 66, 67, 65]);
  });

  it('evicts to stay within the occupied-area budget', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 10, width: 10 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxArea: 250,
      rasterizerBackend: backend,
      width: 256,
    });

    getGlyphAtlasEntry(atlas, 65);
    getGlyphAtlasEntry(atlas, 66);
    getGlyphAtlasEntry(atlas, 67);

    expect(atlas.runtime.entries.size).toBe(2);
    expect(atlas.runtime.occupiedArea).toBeLessThanOrEqual(250);
  });

  it('leaves both budgets unbounded when they are not set', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 10, width: 10 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      rasterizerBackend: backend,
      width: 256,
    });

    for (let cp = 65; cp < 85; cp++) getGlyphAtlasEntry(atlas, cp);

    expect(atlas.runtime.entries.size).toBe(20);
  });

  it('keeps the running totals equal to the live cache after eviction', () => {
    const { backend } = createMockRasterizerBackend((cp) => ({ height: 6 + (cp % 5), width: 6 + (cp % 3) }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 128,
      maxBytes: 2000,
      rasterizerBackend: backend,
      width: 128,
    });

    for (let cp = 65; cp < 80; cp++) getGlyphAtlasEntry(atlas, cp);

    let bytes = 0;
    let area = 0;
    for (const bitmap of atlas.runtime.bitmaps.values()) {
      bytes += bitmap.pixels.byteLength;
      area += bitmap.width * bitmap.height;
    }
    expect(atlas.runtime.retainedBytes).toBe(bytes);
    expect(atlas.runtime.occupiedArea).toBe(area);
  });

  it('admits a single glyph larger than the whole budget rather than evicting forever', () => {
    const { backend } = createMockRasterizerBackend(() => ({ height: 20, width: 20 }));
    const atlas = createGlyphAtlas({
      fontFamily: 'mock',
      fontSize: 16,
      height: 256,
      maxBytes: 100,
      rasterizerBackend: backend,
      width: 256,
    });

    expect(getGlyphAtlasEntry(atlas, 65)).not.toBeNull();
    expect(atlas.runtime.entries.size).toBe(1);
  });
});

describe('setGlyphAtlasEntryGuard', () => {
  afterEach(() => {
    setGlyphAtlasEntryGuard(null);
  });

  it('reports the reason and codepoint for each blocked lookup', () => {
    const seen: Array<[string, number]> = [];
    setGlyphAtlasEntryGuard((reason, codepoint) => seen.push([reason, codepoint]));

    getGlyphAtlasEntry(
      createGlyphAtlas({
        fontFamily: 'm',
        fontSize: 16,
        height: 64,
        rasterizerBackend: { rasterize: () => null },
        width: 64,
      }),
      0x41,
    );

    expect(seen).toEqual([['rasterizer-returned-null', 0x41]]);
  });

  it('stays silent for a lookup that succeeds', () => {
    const seen: string[] = [];
    setGlyphAtlasEntryGuard((reason) => seen.push(reason));
    const { backend } = createMockRasterizerBackend();

    getGlyphAtlasEntry(
      createGlyphAtlas({ fontFamily: 'm', fontSize: 16, height: 64, rasterizerBackend: backend, width: 64 }),
      65,
    );

    expect(seen).toEqual([]);
  });

  it('stops reporting once cleared with null', () => {
    let calls = 0;
    setGlyphAtlasEntryGuard(() => (calls += 1));
    const nullBackend: GlyphRasterizerBackend = { rasterize: () => null };
    const atlas = createGlyphAtlas({
      fontFamily: 'm',
      fontSize: 16,
      height: 64,
      rasterizerBackend: nullBackend,
      width: 64,
    });

    getGlyphAtlasEntry(atlas, 65);
    setGlyphAtlasEntryGuard(null);
    getGlyphAtlasEntry(atlas, 66);

    expect(calls).toBe(1);
  });
});
