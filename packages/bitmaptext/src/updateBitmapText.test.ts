import type { GlyphEntry, GlyphSource, UniformColorTransformMaterial } from '@flighthq/types';
import { UniformColorTransformMaterialKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createBitmapText, getBitmapTextBounds, getBitmapTextQuadBatch, setBitmapTextColor } from './bitmapText';
import { updateBitmapText } from './updateBitmapText';

// A deterministic glyph source: every visible glyph is 6x8 with advance 10 and bearingY 8 (so line
// tops sit at y=0), a space advances 5 with no pixels, and the pair (A, B) kerns by -2.
function createTestGlyphSource(): GlyphSource {
  const entries = new Map<number, GlyphEntry>();
  const add = (cp: number, x: number): void => {
    entries.set(cp, { advance: 10, bearingX: 0, bearingY: 8, height: 8, width: 6, x, y: 0 });
  };
  add(0x41, 0); // A
  add(0x42, 6); // B
  entries.set(0x20, { advance: 5, bearingX: 0, bearingY: 0, height: 0, width: 0, x: 0, y: 0 }); // space
  const kerning = new Map<number, number>([[(0x41 << 16) | 0x42, -2]]);
  return {
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: (l, r) => kerning.get((l << 16) | r) ?? 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

describe('updateBitmapText', () => {
  it('places each glyph at its cumulative advance, applying kerning', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // A.x
    expect(data.transforms[1]).toBe(0); // A.y
    expect(data.transforms[2]).toBe(8); // B.x = 10 (advance) - 2 (kerning)
    expect(data.transforms[3]).toBe(0); // B.y
  });

  it('builds one atlas region per distinct glyph and references it by id', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.atlas!.regions).toHaveLength(2);
    expect(data.ids[0]).toBe(0);
    expect(data.ids[1]).toBe(1);
    expect(data.atlas!.regions[0].x).toBe(0); // A rect
    expect(data.atlas!.regions[1].x).toBe(6); // B rect
  });

  it('reuses one region for repeated codepoints', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AA' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.atlas!.regions).toHaveLength(1);
    expect(data.ids[0]).toBe(0);
    expect(data.ids[1]).toBe(0);
  });

  it('starts a new line at the metric line advance on an explicit newline', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'A\nB' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // line 0 A.x
    expect(data.transforms[1]).toBe(0); // line 0 A.y
    expect(data.transforms[2]).toBe(0); // line 1 B.x
    expect(data.transforms[3]).toBe(10); // line 1 B.y = 1 * (8 + 2 + 0)
  });

  it('scales the line advance by lineHeight', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'A\nB', lineHeight: 2 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.transforms[3]).toBe(20); // 2 * (8 + 2 + 0)
  });

  it('word-wraps at a word boundary when the width is exceeded', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AA AA', wrapWidth: 30 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
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
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AA AA' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.instanceCount).toBe(4);
    for (let i = 0; i < data.instanceCount; i++) expect(data.transforms[i * 2 + 1]).toBe(0);
    expect(data.transforms[4]).toBe(25); // third glyph: word1 width 20 + space 5
    expect(data.transforms[6]).toBe(35);
  });

  it('offsets a line for center alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB', wrapWidth: 100, align: 'center' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.transforms[0]).toBe(41); // (100 - 18) / 2
    expect(data.transforms[2]).toBe(49); // 41 + 8
  });

  it('offsets a line for right alignment', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB', wrapWidth: 100, align: 'right' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.transforms[0]).toBe(82); // 100 - 18
  });

  it('stretches inter-word gaps for justify on non-final lines', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AA AA AA', wrapWidth: 50, align: 'justify' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
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
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'A?B' });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.instanceCount).toBe(2);
    expect(data.transforms[0]).toBe(0); // A
    expect(data.transforms[2]).toBe(8); // B placed as if '?' were absent (10 - 2 kerning)
  });

  it('adds letterSpacing after each glyph advance', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB', letterSpacing: 1 });
    updateBitmapText(text);
    const data = getBitmapTextQuadBatch(text)!.data;
    expect(data.transforms[2]).toBe(9); // 10 + 1 (spacing) - 2 (kerning)
  });

  it('lays out an empty string as an empty batch without throwing', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: '' });
    expect(() => updateBitmapText(text)).not.toThrow();
    expect(getBitmapTextQuadBatch(text)!.data.instanceCount).toBe(0);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.width).toBe(0);
    expect(bounds.height).toBe(0);
  });

  it('reports laid-out bounds covering the glyph extent', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB' });
    updateBitmapText(text);
    const bounds = getBitmapTextBounds(text);
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(14); // B at x=8, region width 6 → right edge 14
    expect(bounds.height).toBe(8);
  });

  it('sets a tint material only for non-white colors', () => {
    const text = createBitmapText(createTestGlyphSource(), null, { text: 'AB' });
    updateBitmapText(text);
    expect(getBitmapTextQuadBatch(text)!.material).toBeNull();
    setBitmapTextColor(text, 0xff0000ff);
    updateBitmapText(text);
    const material = getBitmapTextQuadBatch(text)!.material as UniformColorTransformMaterial | null;
    expect(material).not.toBeNull();
    expect(material!.kind).toBe(UniformColorTransformMaterialKind);
    expect(material!.colorTransform.redMultiplier).toBe(1);
    expect(material!.colorTransform.greenMultiplier).toBe(0);
  });
});
