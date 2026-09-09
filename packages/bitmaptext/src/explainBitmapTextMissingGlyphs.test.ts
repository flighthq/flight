import type { GlyphEntry, GlyphSource } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainBitmapTextMissingGlyphs } from './explainBitmapTextMissingGlyphs';

function createSource(codepoints: readonly number[]): GlyphSource {
  const entries = new Map<number, GlyphEntry>();
  for (const cp of codepoints) {
    entries.set(cp, { advance: 10, bearingX: 0, bearingY: 8, height: 8, page: 0, width: 6, x: 0, y: 0 });
  }
  return {
    [EntityRuntimeKey]: undefined,
    getGlyphAtlasImage: () => null,
    getGlyphEntry: (cp) => entries.get(cp) ?? null,
    getGlyphKerning: () => 0,
    getGlyphLayoutVersion: () => 0,
    getGlyphMetrics: () => ({ ascent: 8, descent: 2, lineGap: 0 }),
  };
}

describe('explainBitmapTextMissingGlyphs', () => {
  it('returns empty when all codepoints have glyphs', () => {
    const source = createSource([0x41, 0x42]);
    const result = explainBitmapTextMissingGlyphs(source, 'AB');
    expect(result.missingCodepoints).toEqual([]);
    expect(result.totalCodepoints).toBe(2);
  });

  it('reports missing codepoints', () => {
    const source = createSource([0x41]);
    const result = explainBitmapTextMissingGlyphs(source, 'ABC');
    expect(result.missingCodepoints).toEqual([0x42, 0x43]);
    expect(result.totalCodepoints).toBe(3);
  });

  it('deduplicates repeated missing codepoints', () => {
    const source = createSource([0x41]);
    const result = explainBitmapTextMissingGlyphs(source, 'ABBA');
    expect(result.missingCodepoints).toEqual([0x42]);
    expect(result.totalCodepoints).toBe(4);
  });

  it('skips newlines and carriage returns', () => {
    const source = createSource([0x41, 0x42]);
    const result = explainBitmapTextMissingGlyphs(source, 'A\nB\r');
    expect(result.missingCodepoints).toEqual([]);
    expect(result.totalCodepoints).toBe(2);
  });

  it('returns zero totals for empty string', () => {
    const source = createSource([]);
    const result = explainBitmapTextMissingGlyphs(source, '');
    expect(result.missingCodepoints).toEqual([]);
    expect(result.totalCodepoints).toBe(0);
  });
});
