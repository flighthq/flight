import { EntityRuntimeKey, PathCommand } from '@flighthq/types/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { readOpenTypeGlyphOutline, readOpenTypeGlyphRanges } from './openTypeGlyf';
import { readOpenTypeGlyphCount, readOpenTypeLocaFormat } from './openTypeMetrics';
import { createSyntheticFont, emptySyntheticGlyph, squareSyntheticGlyph } from './openTypeTestHelper';
import type { SyntheticGlyph } from './openTypeTestHelper';
import { readSfntTableDirectory } from './sfntTableDirectory';

function createPath(): Path {
  return { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'evenOdd' };
}

// Reads a glyph out of a synthetic font through the same steps the source does, so these tests exercise
// the real `loca`/`glyf` pair rather than a hand-built range array.
function readGlyph(glyphs: readonly SyntheticGlyph[], glyphIndex: number): { ok: boolean; path: Path } {
  const font = createSyntheticFont({ glyphs });
  const directory = readSfntTableDirectory(font)!;
  const ranges = readOpenTypeGlyphRanges(
    font,
    directory,
    readOpenTypeGlyphCount(font, directory),
    readOpenTypeLocaFormat(font, directory),
  )!;
  const path = createPath();
  return { ok: readOpenTypeGlyphOutline(path, font, directory, ranges, glyphIndex), path };
}

describe('readOpenTypeGlyphOutline', () => {
  it('writes the winding rather than leaving whatever the caller had', () => {
    // Seeded with the WRONG rule on purpose. A fresh `createPath` already defaults to nonZero, so a
    // test that built one would pass whether or not this reader writes the field — and a caller
    // reusing a scratch path across glyphs is exactly the case that keeps a stale value and renders
    // a counter as a solid blob.
    const path: Path = { [EntityRuntimeKey]: undefined, commands: [], data: [], winding: 'evenOdd' };
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] });
    const directory = readSfntTableDirectory(font)!;
    const ranges = readOpenTypeGlyphRanges(
      font,
      directory,
      readOpenTypeGlyphCount(font, directory),
      readOpenTypeLocaFormat(font, directory),
    )!;
    readOpenTypeGlyphOutline(path, font, directory, ranges, 1);
    expect(path.winding).toBe('nonZero');
  });

  it('emits one line per edge and closes, without a redundant segment back to the start', () => {
    const { ok, path } = readGlyph([emptySyntheticGlyph(), squareSyntheticGlyph(100)], 1);
    expect(ok).toBe(true);
    // Four corners: a move, three lines, and a close that implies the fourth edge.
    expect(path.commands).toEqual([
      PathCommand.MOVE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.LINE_TO,
      PathCommand.CLOSE,
    ]);
  });

  // The rule that makes this format different from every other path format: two consecutive off-curve
  // points imply an on-curve point exactly halfway between them, which the file omits because it is
  // recoverable. A reader that takes the point list literally visibly cuts corners.
  it('reconstructs the on-curve point implied between two consecutive off-curve points', () => {
    const glyph: SyntheticGlyph = {
      endPoints: [2],
      points: [
        [0, 0, true],
        [100, 0, false],
        [100, 100, false],
      ],
    };
    const { path } = readGlyph([emptySyntheticGlyph(), glyph], 1);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CURVE_TO, PathCommand.CURVE_TO, PathCommand.CLOSE]);
    // First curve ends at the midpoint of the two controls — (100,0) and (100,100) → (100,50), negated.
    expect(path.data.slice(2, 6)).toEqual([100, -0, 100, -50]);
  });

  it('starts at the midpoint when a contour opens and closes off-curve', () => {
    const glyph: SyntheticGlyph = {
      endPoints: [2],
      points: [
        [0, 100, false],
        [50, 0, true],
        [100, 100, false],
      ],
    };
    const { path } = readGlyph([emptySyntheticGlyph(), glyph], 1);
    // Neither the first nor the last point is on-curve, so the contour begins halfway between them:
    // (0,100) and (100,100) → (50,100), negated to y-down.
    expect(path.data.slice(0, 2)).toEqual([50, -100]);
    expect(path.commands[0]).toBe(PathCommand.MOVE_TO);
  });

  it('emits a quadratic through a single off-curve control', () => {
    const glyph: SyntheticGlyph = {
      endPoints: [2],
      points: [
        [0, 0, true],
        [50, 100, false],
        [100, 0, true],
      ],
    };
    const { path } = readGlyph([emptySyntheticGlyph(), glyph], 1);
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.CURVE_TO, PathCommand.CLOSE]);
    expect(path.data).toEqual([0, -0, 50, -100, 100, -0]);
  });

  it('reads a second contour into the same path', () => {
    const glyph: SyntheticGlyph = {
      endPoints: [3, 7],
      points: [
        [0, 0, true],
        [10, 0, true],
        [10, 10, true],
        [0, 10, true],
        [20, 20, true],
        [30, 20, true],
        [30, 30, true],
        [20, 30, true],
      ],
    };
    const { path } = readGlyph([emptySyntheticGlyph(), glyph], 1);
    expect(path.commands.filter((command) => command === PathCommand.MOVE_TO)).toHaveLength(2);
    expect(path.commands.filter((command) => command === PathCommand.CLOSE)).toHaveLength(2);
  });

  it('returns true with an empty path for a glyph with no contours', () => {
    const { ok, path } = readGlyph([emptySyntheticGlyph()], 0);
    expect(ok).toBe(true);
    expect(path.commands).toEqual([]);
  });

  it('replaces the previous contents of out rather than appending to them', () => {
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(100)] });
    const directory = readSfntTableDirectory(font)!;
    const ranges = readOpenTypeGlyphRanges(font, directory, readOpenTypeGlyphCount(font, directory), 1)!;
    const path = createPath();
    readOpenTypeGlyphOutline(path, font, directory, ranges, 1);
    const first = path.commands.length;
    readOpenTypeGlyphOutline(path, font, directory, ranges, 1);
    expect(path.commands).toHaveLength(first);
  });

  it('returns false for an index outside the range table', () => {
    expect(readGlyph([emptySyntheticGlyph()], 5).ok).toBe(false);
    expect(readGlyph([emptySyntheticGlyph()], -1).ok).toBe(false);
  });
});

describe('readOpenTypeGlyphRanges', () => {
  it('yields one more entry than there are glyphs, so every glyph has an end', () => {
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph(), squareSyntheticGlyph(10)] });
    const directory = readSfntTableDirectory(font)!;
    expect(readOpenTypeGlyphRanges(font, directory, 2, 1)).toHaveLength(3);
  });

  it('returns the sentinel when loca is absent', () => {
    const font = createSyntheticFont({ omitTable: 'loca' });
    expect(readOpenTypeGlyphRanges(font, readSfntTableDirectory(font)!, 1, 1)).toBeNull();
  });

  it('returns the sentinel when loca is too short for the glyph count it must index', () => {
    const font = createSyntheticFont({ glyphs: [emptySyntheticGlyph()] });
    expect(readOpenTypeGlyphRanges(font, readSfntTableDirectory(font)!, 999, 1)).toBeNull();
  });
});
