import type { ShapedRun } from '@flighthq/types';

// Returns the per-grapheme caret x-positions for the run, in visual order. Each position is the
// x-coordinate of the caret insertion point before the corresponding glyph, measured in pixels
// from the left edge of the run. The returned array has `glyphCount + 1` entries: index 0 is the
// left edge (0.0), and the last entry is the total advance width of the run.
//
// Unlike summing per-character widths, this respects per-glyph xOffset (mark attachment, kerning
// corrections) and ligature clusters — the caret jumps at cluster boundaries, not character
// boundaries, which is correct for editing into ligatures and composed characters.
export function getCaretPositionsForRun(run: Readonly<ShapedRun>): number[] {
  const glyphs = run.glyphs;
  const count = run.glyphCount;
  const positions = new Array<number>(count + 1);
  positions[0] = 0;
  let x = 0;
  for (let i = 0; i < count; i++) {
    x += glyphs[i].xAdvance;
    positions[i + 1] = x;
  }
  return positions;
}

// Returns the cluster index (UTF-16 code-unit offset into the shaped string) for the glyph that
// covers `stringIndex`. If no glyph covers the given index exactly, returns the cluster of the
// nearest preceding glyph. Returns -1 for an empty run or when `stringIndex` is out of range.
//
// This replaces per-character advance summing for caret movement: instead of iterating characters,
// callers locate the correct cluster and use `getCaretPositionsForRun` for sub-cluster positioning.
export function getClusterForIndex(run: Readonly<ShapedRun>, stringIndex: number): number {
  if (run.glyphCount === 0) return -1;
  if (stringIndex < 0) return -1;
  const glyphs = run.glyphs;
  // Find the last glyph whose cluster value is <= stringIndex.
  let best = -1;
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i].cluster <= stringIndex) {
      best = glyphs[i].cluster;
    }
  }
  return best;
}

// Returns the [start, end) UTF-16 string index range that the given cluster occupies. `cluster`
// is a cluster value as returned by `getClusterForIndex`. Returns null when the cluster is not
// found in the run, or when the run is empty.
//
// The range is derived from the cluster values of adjacent glyphs: the end of a cluster is the
// cluster value of the next distinct cluster (or the run's total string length, inferred from the
// last glyph's cluster + 1, which is a conservative estimate). Callers that know the source
// string length should pass it as `stringLength` to get an exact end for the final cluster.
export function getIndexRangeForCluster(
  run: Readonly<ShapedRun>,
  cluster: number,
  stringLength?: number,
): readonly [number, number] | null {
  if (run.glyphCount === 0) return null;
  const glyphs = run.glyphs;
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i].cluster === cluster) {
      // Find the next distinct cluster value to determine the end of this cluster's range.
      let end: number | undefined;
      for (let j = i + 1; j < glyphs.length; j++) {
        if (glyphs[j].cluster !== cluster) {
          end = glyphs[j].cluster;
          break;
        }
      }
      if (end === undefined) {
        // Last cluster in the run: end is either the supplied string length or cluster + 1.
        end = stringLength !== undefined ? stringLength : cluster + 1;
      }
      return [cluster, end];
    }
  }
  return null;
}
