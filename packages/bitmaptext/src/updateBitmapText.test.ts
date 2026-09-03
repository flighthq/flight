import {
  createGlyphAtlas,
  createGlyphSourceFromGlyphAtlas,
  createStubGlyphRasterizerBackend,
  getGlyphAtlasBitmap,
} from '@flighthq/glyphatlas/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type {
  Bitmap,
  GlyphAtlas,
  GlyphEntry,
  GlyphRasterizerBackend,
  GlyphSource,
  ImageResource,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import { createBitmapText, getBitmapTextBounds, getBitmapTextPages, isBitmapTextGlyphLayoutStale } from './bitmapText';
import { refreshBitmapTextGlyphLayout, setBitmapTextLayoutGuard, updateBitmapText } from './updateBitmapText';

// A deterministic single-page glyph source: every visible glyph is 6x8 with advance 10 and bearingY 8
// (so line tops sit at y=0), a space advances 5 with no pixels, and the pair (A, B) kerns by -2. All
// glyphs live on page 0, whose atlas image is a stub `Image`.
function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>();
  const add = (cp: number, x: number): void => {
    entries.set(cp, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x, y: 0 });
  };
  add(0x41, 0); // A
  add(0x42, 6); // B
  entries.set(0x20, { advance: 5, bearingX: 0, bearingY: 0, height: 0, page: 0, width: 0, x: 0, y: 0 }); // space
  const kerning = new Map<number, number>([[(0x41 << 16) | 0x42, -2]]);
  const image = {} as ImageResource;
  return {
    [EntityRuntimeKey]: undefined,
    getGlyphAtlasImage: (page = 0) => (page === 0 ? image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: (l, r) => kerning.get((l << 16) | r) ?? 0,
    getGlyphLayoutVersion: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

// A two-page glyph source: 'A' lives on page 0, 'B' on page 1, each page a DISTINCT stub image.
function createTwoPageGlyphSource(): { source: GlyphSource; page0Image: ImageResource; page1Image: ImageResource } {
  const page0Image = {} as ImageResource;
  const page1Image = {} as ImageResource;
  const entries = new Map<number, GlyphEntry>([
    [0x41, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 0, y: 0 }], // A → page 0
    [0x42, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 1, width: 6, x: 3, y: 0 }], // B → page 1
  ]);
  const source: GlyphSource = {
    [EntityRuntimeKey]: undefined,
    getGlyphAtlasImage: (page = 0) => (page === 0 ? page0Image : page === 1 ? page1Image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphLayoutVersion: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
  return { source, page0Image, page1Image };
}

// Rasterizes every glyph as a solid block whose RED channel IS the codepoint, so a rect in the atlas
// bitmap identifies which glyph actually occupies it. That is the oracle this file needs: after a
// repack every rect is still a well-formed rect over real pixels, so only reading the pixels can tell a
// correct region from one that now covers the wrong glyph. Codepoints stay under 0x100 for the channel
// to hold them exactly.
function createCodepointColorRasterizerBackend(size: number): GlyphRasterizerBackend {
  return {
    rasterize(codepoint) {
      const pixels = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        pixels[i * 4] = codepoint;
        pixels[i * 4 + 3] = 0xff;
      }
      return { advance: size, bearingX: 0, bearingY: size, height: size, pixels, width: size };
    },
  };
}

// The codepoint whose pixels sit at `region`'s top-left in the atlas bitmap, per the rasterizer above.
function readGlyphCodepointAtRegion(bitmap: Readonly<Bitmap>, x: number, y: number): number {
  return bitmap.data[(y * bitmap.width + x) * 4];
}

// A source that REPLACES 'A' with a relocated entry and bumps its layout version once, on the `nth`
// glyph lookup — a repack landing part way through a layout, driven at the seam so the moment is exact.
//
// Replacing the object rather than moving the one already handed out is the whole point. A repack that
// only relocates survivors mutates their entries in place, so a pass that captured those references
// picks the move up for free and never needs re-running. The case that genuinely needs it is a repack
// that DROPS a glyph: the reference the pass captured is orphaned at its old rect, and the next lookup
// mints a fresh entry somewhere else. `nth: 0` never fires, for the held-still half of the pair.
function createMidLayoutRelocatingGlyphSource(nth: number): GlyphSource {
  const image = {} as ImageResource;
  const entries = new Map<number, GlyphEntry>();
  for (let codepoint = 0x41; codepoint <= 0x5a; codepoint++) {
    entries.set(codepoint, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 0, y: 0 });
  }
  let lookups = 0;
  let version = 0;
  return {
    [EntityRuntimeKey]: undefined,
    getGlyphAtlasImage: (page = 0) => (page === 0 ? image : null),
    getGlyphEntry(codepoint) {
      lookups++;
      if (lookups === nth) {
        entries.set(0x41, { ...entries.get(0x41)!, x: RELOCATED_GLYPH_X });
        version++;
      }
      return entries.get(codepoint) ?? null;
    },
    getGlyphKerning: () => 0,
    getGlyphLayoutVersion: () => version,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

// An atlas small enough that a modest run of glyphs exhausts it and forces the evict-then-repack path
// that relocates everything already cached — the situation `refreshBitmapTextGlyphLayout` exists for.
function createRepackingGlyphAtlas(): GlyphAtlas {
  return createGlyphAtlas({
    fontFamily: 'codepoint-color',
    fontSize: 8,
    height: 32,
    padding: 1,
    rasterizerBackend: createCodepointColorRasterizerBackend(8),
    width: 32,
  });
}

describe('refreshBitmapTextGlyphLayout', () => {
  // The defect this whole seam exists for: a repack relocates and re-uses atlas space, so a node laid
  // out BEFORE it keeps regions that now cover other glyphs. Nothing about the node, the entry object,
  // or the atlas image changes to reveal it — the pixels under the baked rect are the only witness.
  it('re-bakes regions that a repack left covering the wrong glyphs', () => {
    const atlas = createRepackingGlyphAtlas();
    const source = createGlyphSourceFromGlyphAtlas(atlas);
    const text = createBitmapText(source, { text: 'A' });
    updateBitmapText(text);

    const baked = getBitmapTextPages(text)[0].atlas.regions[0];
    const bitmap = getGlyphAtlasBitmap(atlas);
    expect(readGlyphCodepointAtRegion(bitmap, baked.x, baked.y)).toBe(0x41);

    // Fill the atlas from elsewhere — a second text node, a direct lookup, any other consumer of the
    // same atlas would do. 'A' is the least recently used, so it is evicted and its space handed on.
    for (let codepoint = 0x42; codepoint <= 0x5a; codepoint++) source.getGlyphEntry(codepoint);

    expect(isBitmapTextGlyphLayoutStale(text)).toBe(true);
    expect(readGlyphCodepointAtRegion(bitmap, baked.x, baked.y)).not.toBe(0x41);

    expect(refreshBitmapTextGlyphLayout(text)).toBe(true);
    const rebaked = getBitmapTextPages(text)[0].atlas.regions[0];
    expect(readGlyphCodepointAtRegion(bitmap, rebaked.x, rebaked.y)).toBe(0x41);
    expect(isBitmapTextGlyphLayoutStale(text)).toBe(false);
  });

  it('does nothing and reports nothing done when the glyph placement has not moved', () => {
    const atlas = createRepackingGlyphAtlas();
    const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { text: 'A' });
    updateBitmapText(text);
    const before = getBitmapTextPages(text)[0].atlas.regions[0];

    expect(refreshBitmapTextGlyphLayout(text)).toBe(false);
    expect(getBitmapTextPages(text)[0].atlas.regions[0]).toBe(before);
  });

  it('lays out a node that has never been laid out', () => {
    const atlas = createRepackingGlyphAtlas();
    const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { text: 'A' });

    expect(refreshBitmapTextGlyphLayout(text)).toBe(true);
    expect(getBitmapTextPages(text)[0].instanceCount).toBe(1);
  });

  // Fan-out is the reason the seam versions rather than the consumer comparing rects: one atlas backs
  // every node bound to it, and the node that triggered the repack must not be the only one repaired.
  it('repairs every node sharing the atlas, not only the one that forced the repack', () => {
    const atlas = createRepackingGlyphAtlas();
    const source = createGlyphSourceFromGlyphAtlas(atlas);
    const first = createBitmapText(source, { text: 'A' });
    updateBitmapText(first);

    const second = createBitmapText(source, { text: 'BCDEFGHIJKLMNOPQRSTUVWXYZ' });
    updateBitmapText(second);

    expect(isBitmapTextGlyphLayoutStale(first)).toBe(true);
    refreshBitmapTextGlyphLayout(first);
    const bitmap = getGlyphAtlasBitmap(atlas);
    const region = getBitmapTextPages(first)[0].atlas.regions[0];
    expect(readGlyphCodepointAtRegion(bitmap, region.x, region.y)).toBe(0x41);
  });
});

describe('setBitmapTextLayoutGuard', () => {
  afterEach(() => setBitmapTextLayoutGuard(null));

  it('reports the reason and the passes spent when a layout cannot settle', () => {
    const seen: [string, number][] = [];
    setBitmapTextLayoutGuard((reason, attempts) => seen.push([reason, attempts]));
    const source = createGlyphSourceFromGlyphAtlas(createRepackingGlyphAtlas());

    updateBitmapText(createBitmapText(source, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));

    expect(seen).toEqual([['layout-did-not-converge', 3]]);
  });

  it('stays silent for a layout that settles', () => {
    const seen: string[] = [];
    setBitmapTextLayoutGuard((reason) => seen.push(reason));
    const source = createGlyphSourceFromGlyphAtlas(createRepackingGlyphAtlas());

    updateBitmapText(createBitmapText(source, { text: 'AB' }));

    expect(seen).toEqual([]);
  });

  it('stops reporting once cleared with null', () => {
    let calls = 0;
    setBitmapTextLayoutGuard(() => (calls += 1));
    const source = createGlyphSourceFromGlyphAtlas(createRepackingGlyphAtlas());

    updateBitmapText(createBitmapText(source, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));
    setBitmapTextLayoutGuard(null);
    updateBitmapText(createBitmapText(source, { text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }));

    expect(calls).toBe(1);
  });
});

describe('updateBitmapText', () => {
  // A repack can land DURING a layout — a glyph late in the string evicting one placed early in it —
  // and the pass that saw both placements is wrong about the first. The retry is what makes a single
  // `updateBitmapText` call self-consistent rather than merely detectably stale afterwards.
  // A pass that read a rect BEFORE the relocation and one that read it after cannot both be right, and
  // the pass has no way to go back for the ones it already consumed. Re-running is what makes a single
  // `updateBitmapText` call self-consistent rather than merely detectably stale afterwards.
  it('re-runs a layout whose glyph placement moved part way through it', () => {
    const source = createMidLayoutRelocatingGlyphSource(2);
    const text = createBitmapText(source, { text: 'ABC' });

    updateBitmapText(text);

    // 'A' is the first region baked, and the relocation landed after the pass had already read it.
    expect(getBitmapTextPages(text)[0].atlas.regions[0].x).toBe(RELOCATED_GLYPH_X);
    expect(isBitmapTextGlyphLayoutStale(text)).toBe(false);
  });

  it('does not re-run a layout whose glyph placement held still', () => {
    const source = createMidLayoutRelocatingGlyphSource(0);
    const text = createBitmapText(source, { text: 'ABC' });
    const seen: string[] = [];
    setBitmapTextLayoutGuard((reason) => seen.push(reason));

    updateBitmapText(text);

    expect(getBitmapTextPages(text)[0].atlas.regions[0].x).toBe(0);
    expect(seen).toEqual([]);
    setBitmapTextLayoutGuard(null);
  });

  // The end-to-end companion to the seam-driven pair above, over the real atlas. It passes without the
  // retry as well — this atlas only relocates, and relocation moves the entry the pass is holding — so
  // it is here to prove the whole path stays coherent, not to exercise the re-run.
  it('ends coherent through an atlas that repacks during the layout', () => {
    const atlas = createRepackingGlyphAtlas();
    const source = createGlyphSourceFromGlyphAtlas(atlas);
    // Fill most of the atlas with glyphs this text does not use, so laying it out has to evict and
    // repack partway through — over the glyphs the same pass already placed.
    for (let codepoint = 0x61; codepoint <= 0x66; codepoint++) source.getGlyphEntry(codepoint);
    const text = createBitmapText(source, { text: 'ABCDEF' });
    updateBitmapText(text);

    const bitmap = getGlyphAtlasBitmap(atlas);
    const page = getBitmapTextPages(text)[0];
    expect(page.instanceCount).toBeGreaterThan(0);
    for (let id = 0; id < page.atlas.regions.length; id++) {
      const region = page.atlas.regions[id];
      const codepoint = readGlyphCodepointAtRegion(bitmap, region.x, region.y);
      expect(codepoint).toBe(0x41 + id);
    }
    expect(isBitmapTextGlyphLayoutStale(text)).toBe(false);
  });

  it('emits non-empty glyph quads end-to-end from a stub-fed glyph atlas (headless, issue #8)', () => {
    const atlas = createGlyphAtlas({
      fontFamily: 'unavailable',
      fontSize: 24,
      height: 256,
      rasterizerBackend: createStubGlyphRasterizerBackend(),
      width: 256,
    });
    const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { text: 'Hi' });
    updateBitmapText(text);
    const pages = getBitmapTextPages(text);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]!.instanceCount).toBe(2);
  });

  it('places each glyph at its cumulative advance, applying kerning', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(2);
    expect(page.transforms[0]).toBe(0); // A.x
    expect(page.transforms[1]).toBe(0); // A.y
    expect(page.transforms[2]).toBe(8); // B.x = 10 (advance) - 2 (kerning)
    expect(page.transforms[3]).toBe(0); // B.y
  });

  it('builds one atlas region per distinct glyph and references it by id', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.atlas.regions).toHaveLength(2);
    expect(page.ids[0]).toBe(0);
    expect(page.ids[1]).toBe(1);
    expect(page.atlas.regions[0].x).toBe(0); // A rect
    expect(page.atlas.regions[1].x).toBe(6); // B rect
  });

  it('reuses one region for repeated codepoints', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(2);
    expect(page.atlas.regions).toHaveLength(1);
    expect(page.ids[0]).toBe(0);
    expect(page.ids[1]).toBe(0);
  });

  it('starts a new line at the metric line advance on an explicit newline', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A\nB' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(2);
    expect(page.transforms[0]).toBe(0); // line 0 A.x
    expect(page.transforms[1]).toBe(0); // line 0 A.y
    expect(page.transforms[2]).toBe(0); // line 1 B.x
    expect(page.transforms[3]).toBe(10); // line 1 B.y = 1 * (8 + 2 + 0)
  });

  it('scales the line advance by lineHeight', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A\nB', lineHeight: 2 });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.transforms[3]).toBe(20); // 2 * (8 + 2 + 0)
  });

  it('word-wraps at a word boundary when the width is exceeded', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA', wrapWidth: 30 });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(4);
    let firstLine = 0;
    let secondLine = 0;
    for (let i = 0; i < page.instanceCount; i++) {
      if (page.transforms[i * 2 + 1] === 0) firstLine++;
      else if (page.transforms[i * 2 + 1] === 10) secondLine++;
    }
    expect(firstLine).toBe(2);
    expect(secondLine).toBe(2);
  });

  it('keeps words on one line and honors space advance when no wrap is set', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(4);
    for (let i = 0; i < page.instanceCount; i++) expect(page.transforms[i * 2 + 1]).toBe(0);
    expect(page.transforms[4]).toBe(25); // third glyph: word1 width 20 + space 5
    expect(page.transforms[6]).toBe(35);
  });

  it('offsets a line for center alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', wrapWidth: 100, align: 'center' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.transforms[0]).toBe(41); // (100 - 18) / 2
    expect(page.transforms[2]).toBe(49); // 41 + 8
  });

  it('offsets a line for right alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', wrapWidth: 100, align: 'right' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.transforms[0]).toBe(82); // 100 - 18
  });

  it('stretches inter-word gaps for justify on non-final lines', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA AA', wrapWidth: 50, align: 'justify' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    // Line 0 = "AA AA" justified to 50: gap 5 grows by (50 - 45) / 1 = 5, so word 2 starts at 30.
    expect(page.transforms[4]).toBe(30);
    expect(page.transforms[6]).toBe(40);
    // Line 1 = trailing "AA" (paragraph end) stays left.
    const line1 = [];
    for (let i = 0; i < page.instanceCount; i++)
      if (page.transforms[i * 2 + 1] === 10) line1.push(page.transforms[i * 2]);
    expect(line1).toEqual([0, 10]);
  });

  it('omits a missing glyph with no quad and no advance', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A?B' });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.instanceCount).toBe(2);
    expect(page.transforms[0]).toBe(0); // A
    expect(page.transforms[2]).toBe(8); // B placed as if '?' were absent (10 - 2 kerning)
  });

  it('adds letterSpacing after each glyph advance', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', letterSpacing: 1 });
    updateBitmapText(text);
    const page = getBitmapTextPages(text)[0]!;
    expect(page.transforms[2]).toBe(9); // 10 + 1 (spacing) - 2 (kerning)
  });

  it('lays out an empty string as an empty page without throwing', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: '' });
    expect(() => updateBitmapText(text)).not.toThrow();
    expect(getBitmapTextPages(text)[0]!.instanceCount).toBe(0);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  it('reports laid-out bounds covering the glyph extent', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(14); // B at x=8, region width 6 → right edge 14
    expect(bounds.height).toBe(8);
  });

  it('produces exactly one page bound to the page-0 image for a single-page source', () => {
    const source = createTestGlyphSource();
    const text = createBitmapText(source, { text: 'AB' });
    updateBitmapText(text);
    const pages = getBitmapTextPages(text);
    expect(pages).toHaveLength(1);
    expect(pages[0].instanceCount).toBe(2);
    expect(getTextureSource(pages[0].atlas.texture!)).toBe(source.getGlyphAtlasImage(0));
  });

  it('partitions glyphs into one page per glyph-atlas page, each bound to its own page image', () => {
    const { source, page0Image, page1Image } = createTwoPageGlyphSource();
    const text = createBitmapText(source, { text: 'AB' });
    updateBitmapText(text);
    const pages = getBitmapTextPages(text);
    expect(pages).toHaveLength(2);

    // Page 0 holds 'A' only, sampling page0Image; page 1 holds 'B' only, sampling page1Image.
    const page0 = pages[0];
    const page1 = pages[1];
    expect(page0.instanceCount).toBe(1);
    expect(page1.instanceCount).toBe(1);
    expect(getTextureSource(page0.atlas.texture!)).toBe(page0Image);
    expect(getTextureSource(page1.atlas.texture!)).toBe(page1Image);
    expect(page0.atlas.regions[0].x).toBe(0); // A's rect on page 0
    expect(page1.atlas.regions[0].x).toBe(3); // B's rect on page 1
    expect(page0.transforms[0]).toBe(0); // A at pen origin
    expect(page1.transforms[0]).toBe(10); // B after A's advance (no kerning)
  });

  it('spans every page when computing bounds', () => {
    const { source } = createTwoPageGlyphSource();
    const text = createBitmapText(source, { text: 'AB' });
    updateBitmapText(text);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.x).toBe(0);
    expect(bounds.width).toBe(16); // B (page 1) at x=10, width 6 → right edge 16
    expect(bounds.height).toBe(8);
  });
});

// Where the mid-layout relocation moves 'A' to — distinct from every rect the source starts with, so
// a region carrying it can only have come from a pass that ran AFTER the move.
const RELOCATED_GLYPH_X = 17;
