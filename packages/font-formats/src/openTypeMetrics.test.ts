import { describe, expect, it } from 'vitest';

import {
  readOpenTypeAdvances,
  readOpenTypeGlyphCount,
  readOpenTypeLocaFormat,
  readOpenTypeMetrics,
} from './openTypeMetrics';
import { createSyntheticFont, emptySyntheticGlyph, squareSyntheticGlyph } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

describe('readOpenTypeAdvances', () => {
  it('reads one advance per glyph', () => {
    const font = createSyntheticFont({
      advances: [300, 750],
      glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(10)],
    });
    expect([...readOpenTypeAdvances(font, readSfntTableDirectory(font)!, 2)!]).toEqual([300, 750]);
  });

  // `hmtx` is run-length shaped: glyphs past `numberOfHMetrics` repeat the last stated advance. Reading
  // it flat gives every one of them a wrong width, which is exactly how monospaced and CJK fonts stay
  // small — so the bug would be invisible on a Latin test font and wrong on the fonts that use it.
  it('repeats the last stated advance past the long-metric count rather than reading zero', () => {
    const font = createSyntheticFont({
      advances: [600],
      glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(10), squareSyntheticGlyph(20)],
    });
    expect([...readOpenTypeAdvances(font, readSfntTableDirectory(font)!, 3)!]).toEqual([600, 600, 600]);
  });

  it('returns the sentinel when hmtx or hhea is absent', () => {
    for (const table of ['hmtx', 'hhea']) {
      const font = createSyntheticFont({ omitTable: table });
      expect(readOpenTypeAdvances(font, readSfntTableDirectory(font)!, 1)).toBeNull();
    }
  });
});

describe('readOpenTypeGlyphCount', () => {
  it('reads the count maxp declares', () => {
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(10)] });
    expect(readOpenTypeGlyphCount(font, readSfntTableDirectory(font)!)).toBe(2);
  });

  it('returns -1 rather than a count when maxp is absent, so every index is out of range', () => {
    const font = createSyntheticFont({ omitTable: 'maxp' });
    expect(readOpenTypeGlyphCount(font, readSfntTableDirectory(font)!)).toBe(-1);
  });
});

describe('readOpenTypeLocaFormat', () => {
  it('reads the index-to-loc format head declares', () => {
    const font = createSyntheticFont();
    expect(readOpenTypeLocaFormat(font, readSfntTableDirectory(font)!)).toBe(1);
  });

  it('returns -1 for a value that is neither of the two the format defines', () => {
    const font = createSyntheticFont();
    const directory = readSfntTableDirectory(font)!;
    // Guessing here would produce plausible garbage outlines instead of a clean rejection.
    new DataView(font.buffer).setInt16(directory.tables.get('head')!.offset + 50, 7);
    expect(readOpenTypeLocaFormat(font, directory)).toBe(-1);
  });

  it('returns -1 when head is absent', () => {
    const font = createSyntheticFont({ omitTable: 'head' });
    expect(readOpenTypeLocaFormat(font, readSfntTableDirectory(font)!)).toBe(-1);
  });
});

describe('readOpenTypeMetrics', () => {
  it('reads the design-unit scale from head', () => {
    const font = createSyntheticFont({ unitsPerEm: 2048 });
    expect(readOpenTypeMetrics(font, readSfntTableDirectory(font)!)?.unitsPerEm).toBe(2048);
  });

  // `hhea` states descender as a negative distance; `GlyphOutlineMetrics` documents both ascent and
  // descent as POSITIVE distances from the baseline. The flip happens once, here, at the seam.
  it('reports descent as a positive distance although the table stores it negative', () => {
    const font = createSyntheticFont();
    expect(readOpenTypeMetrics(font, readSfntTableDirectory(font)!)).toEqual({
      ascent: 800,
      descent: 200,
      lineGap: 100,
      unitsPerEm: 1000,
    });
  });

  it('returns the sentinel for a zero unitsPerEm rather than a scale that divides by zero', () => {
    const font = createSyntheticFont();
    const directory = readSfntTableDirectory(font)!;
    new DataView(font.buffer).setUint16(directory.tables.get('head')!.offset + 18, 0);
    expect(readOpenTypeMetrics(font, directory)).toBeNull();
  });

  it('returns the sentinel when head or hhea is absent', () => {
    for (const table of ['head', 'hhea']) {
      const font = createSyntheticFont({ omitTable: table });
      expect(readOpenTypeMetrics(font, readSfntTableDirectory(font)!)).toBeNull();
    }
  });
});
