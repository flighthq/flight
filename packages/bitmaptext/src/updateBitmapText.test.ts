import { getDisplayObjectColorAdjustments } from '@flighthq/displayobject';
import {
  createGlyphAtlas,
  createGlyphSourceFromGlyphAtlas,
  createStubGlyphRasterizerBackend,
  setGlyphRasterizerBackend,
} from '@flighthq/glyphatlas';
import type { ColorTransformAdjustment, GlyphEntry, GlyphSource, ImageResource } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createBitmapText, getBitmapTextBounds, getBitmapTextQuadBatches, setBitmapTextColor } from './bitmapText';
import { updateBitmapText } from './updateBitmapText';

// A deterministic single-page glyph source: every visible glyph is 6x8 with advance 10 and bearingY 8
// (so line tops sit at y=0), a space advances 5 with no pixels, and the pair (A, B) kerns by -2. All
// glyphs live on page 0, whose atlas image is a stub `ImageResource`.
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
    getGlyphAtlasImage: (page = 0) => (page === 0 ? image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: (l, r) => kerning.get((l << 16) | r) ?? 0,
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
    getGlyphAtlasImage: (page = 0) => (page === 0 ? page0Image : page === 1 ? page1Image : null),
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
  return { source, page0Image, page1Image };
}

describe('updateBitmapText', () => {
  it('emits non-empty glyph quads end-to-end from a stub-fed glyph atlas (headless, issue #8)', () => {
    // The real headless path: glyphatlas → GlyphSource → bitmaptext, with the deterministic stub
    // rasterizer standing in for a web font that is unavailable in jsdom/CI. Proves BitmapText renders
    // non-blank without a loaded FontFace.
    setGlyphRasterizerBackend(createStubGlyphRasterizerBackend());
    try {
      const atlas = createGlyphAtlas({ fontFamily: 'unavailable', fontSize: 24, height: 256, width: 256 });
      const text = createBitmapText(createGlyphSourceFromGlyphAtlas(atlas), { text: 'Hi' });
      updateBitmapText(text);
      const batches = getBitmapTextQuadBatches(text);
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0]!.data.instanceCount).toBe(2);
    } finally {
      setGlyphRasterizerBackend(null);
    }
  });

  it('places each glyph at its cumulative advance, applying kerning', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // A.x
    expect(data.transforms[1]).toBe(0); // A.y
    expect(data.transforms[2]).toBe(8); // B.x = 10 (advance) - 2 (kerning)
    expect(data.transforms[3]).toBe(0); // B.y
  });

  it('builds one atlas region per distinct glyph and references it by id', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.atlas!.regions).toHaveLength(2);
    expect(data.ids[0]).toBe(0);
    expect(data.ids[1]).toBe(1);
    expect(data.atlas!.regions[0].x).toBe(0); // A rect
    expect(data.atlas!.regions[1].x).toBe(6); // B rect
  });

  it('reuses one region for repeated codepoints', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.atlas!.regions).toHaveLength(1);
    expect(data.ids[0]).toBe(0);
    expect(data.ids[1]).toBe(0);
  });

  it('starts a new line at the metric line advance on an explicit newline', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A\nB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // line 0 A.x
    expect(data.transforms[1]).toBe(0); // line 0 A.y
    expect(data.transforms[2]).toBe(0); // line 1 B.x
    expect(data.transforms[3]).toBe(10); // line 1 B.y = 1 * (8 + 2 + 0)
  });

  it('scales the line advance by lineHeight', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A\nB', lineHeight: 2 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.transforms[3]).toBe(20); // 2 * (8 + 2 + 0)
  });

  it('word-wraps at a word boundary when the width is exceeded', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA', wrapWidth: 30 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(4);
    let firstLine = 0;
    let secondLine = 0;
    for (let i = 0; i < data.instanceCount; i++) {
      if (data.transforms[i * 2 + 1] === 0) firstLine++;
      else if (data.transforms[i * 2 + 1] === 10) secondLine++;
    }
    expect(firstLine).toBe(2);
    expect(secondLine).toBe(2);
  });

  it('keeps words on one line and honors space advance when no wrap is set', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(4);
    for (let i = 0; i < data.instanceCount; i++) expect(data.transforms[i * 2 + 1]).toBe(0);
    expect(data.transforms[4]).toBe(25); // third glyph: word1 width 20 + space 5
    expect(data.transforms[6]).toBe(35);
  });

  it('offsets a line for center alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', wrapWidth: 100, align: 'center' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.transforms[0]).toBe(41); // (100 - 18) / 2
    expect(data.transforms[2]).toBe(49); // 41 + 8
  });

  it('offsets a line for right alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', wrapWidth: 100, align: 'right' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.transforms[0]).toBe(82); // 100 - 18
  });

  it('stretches inter-word gaps for justify on non-final lines', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AA AA AA', wrapWidth: 50, align: 'justify' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    // Line 0 = "AA AA" justified to 50: gap 5 grows by (50 - 45) / 1 = 5, so word 2 starts at 30.
    expect(data.transforms[4]).toBe(30);
    expect(data.transforms[6]).toBe(40);
    // Line 1 = trailing "AA" (paragraph end) stays left.
    const line1 = [];
    for (let i = 0; i < data.instanceCount; i++)
      if (data.transforms[i * 2 + 1] === 10) line1.push(data.transforms[i * 2]);
    expect(line1).toEqual([0, 10]);
  });

  it('omits a missing glyph with no quad and no advance', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'A?B' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // A
    expect(data.transforms[2]).toBe(8); // B placed as if '?' were absent (10 - 2 kerning)
  });

  it('adds letterSpacing after each glyph advance', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB', letterSpacing: 1 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatches(text)[0]!.data;
    expect(data.transforms[2]).toBe(9); // 10 + 1 (spacing) - 2 (kerning)
  });

  it('lays out an empty string as an empty batch without throwing', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: '' });
    expect(() => updateBitmapText(text)).not.toThrow();
    expect(getBitmapTextQuadBatches(text)[0]!.data.instanceCount).toBe(0);
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

  it('sets a whole-batch color-transform tint only for non-white colors', () => {
    const text = createBitmapText(createTestGlyphSource(), { text: 'AB' });
    updateBitmapText(text);
    expect(getDisplayObjectColorAdjustments(getBitmapTextQuadBatches(text)[0]!)).toBeNull();
    setBitmapTextColor(text, 0xff0000ff);
    updateBitmapText(text);
    // One color-transform adjustment on the batch's runtime slot — a single whole-batch tint, not per-glyph.
    const adjustments = getDisplayObjectColorAdjustments(getBitmapTextQuadBatches(text)[0]!);
    expect(adjustments).not.toBeNull();
    expect(adjustments!).toHaveLength(1);
    const colorTransform = (adjustments![0] as ColorTransformAdjustment).colorTransform;
    expect(colorTransform.redMultiplier).toBe(1);
    expect(colorTransform.greenMultiplier).toBe(0);
  });

  it('produces exactly one batch bound to the page-0 image for a single-page source', () => {
    const source = createTestGlyphSource();
    const text = createBitmapText(source, { text: 'AB' });
    updateBitmapText(text);
    const batches = getBitmapTextQuadBatches(text);
    expect(batches).toHaveLength(1);
    expect(batches[0].data.instanceCount).toBe(2);
    expect(batches[0].data.atlas!.image).toBe(source.getGlyphAtlasImage(0));
  });

  it('partitions glyphs into one QuadBatch per page, each bound to its own page image', () => {
    const { source, page0Image, page1Image } = createTwoPageGlyphSource();
    const text = createBitmapText(source, { text: 'AB' });
    updateBitmapText(text);
    const batches = getBitmapTextQuadBatches(text);
    expect(batches).toHaveLength(2);

    // Page 0 holds 'A' only, sampling page0Image; page 1 holds 'B' only, sampling page1Image.
    const page0 = batches[0].data;
    const page1 = batches[1].data;
    expect(page0.instanceCount).toBe(1);
    expect(page1.instanceCount).toBe(1);
    expect(page0.atlas!.image).toBe(page0Image);
    expect(page1.atlas!.image).toBe(page1Image);
    expect(page0.atlas!.regions[0].x).toBe(0); // A's rect on page 0
    expect(page1.atlas!.regions[0].x).toBe(3); // B's rect on page 1
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
