import type { ShapedRun } from '@flighthq/types';

import { getCaretPositionsForRun, getClusterForIndex, getIndexRangeForCluster } from './textShaperCluster';

function _makeRun(glyphs: ReadonlyArray<{ cluster: number; xAdvance: number }>): ShapedRun {
  return {
    advanceWidth: glyphs.reduce((s, g) => s + g.xAdvance, 0),
    direction: 'LeftToRight',
    font: null,
    glyphCount: glyphs.length,
    glyphs: glyphs.map((g) => ({
      cluster: g.cluster,
      glyphId: g.cluster,
      xAdvance: g.xAdvance,
      xOffset: 0,
      yAdvance: 0,
      yOffset: 0,
    })),
    script: 'Latn',
  };
}

describe('getCaretPositionsForRun', () => {
  it('returns [0] for an empty run', () => {
    const run = _makeRun([]);
    expect(getCaretPositionsForRun(run)).toEqual([0]);
  });

  it('returns glyphCount + 1 positions starting at 0', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 8 },
      { cluster: 1, xAdvance: 7 },
      { cluster: 2, xAdvance: 9 },
    ]);
    const pos = getCaretPositionsForRun(run);
    expect(pos).toHaveLength(4);
    expect(pos[0]).toBe(0);
    expect(pos[1]).toBe(8);
    expect(pos[2]).toBe(15);
    expect(pos[3]).toBe(24);
  });

  it('last position equals the run advance width', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 5 },
      { cluster: 1, xAdvance: 3 },
    ]);
    const pos = getCaretPositionsForRun(run);
    expect(pos[pos.length - 1]).toBe(run.advanceWidth);
  });
});

describe('getClusterForIndex', () => {
  it('returns -1 for an empty run', () => {
    expect(getClusterForIndex(_makeRun([]), 0)).toBe(-1);
  });

  it('returns -1 for a negative string index', () => {
    const run = _makeRun([{ cluster: 0, xAdvance: 8 }]);
    expect(getClusterForIndex(run, -1)).toBe(-1);
  });

  it('returns the cluster of the glyph covering the string index', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 8 },
      { cluster: 2, xAdvance: 7 },
      { cluster: 4, xAdvance: 9 },
    ]);
    expect(getClusterForIndex(run, 0)).toBe(0);
    expect(getClusterForIndex(run, 1)).toBe(0);
    expect(getClusterForIndex(run, 2)).toBe(2);
    expect(getClusterForIndex(run, 3)).toBe(2);
    expect(getClusterForIndex(run, 4)).toBe(4);
    expect(getClusterForIndex(run, 10)).toBe(4);
  });
});

describe('getIndexRangeForCluster', () => {
  it('returns null for an empty run', () => {
    expect(getIndexRangeForCluster(_makeRun([]), 0)).toBeNull();
  });

  it('returns null for a cluster not present in the run', () => {
    const run = _makeRun([{ cluster: 0, xAdvance: 8 }]);
    expect(getIndexRangeForCluster(run, 5)).toBeNull();
  });

  it('returns [cluster, nextCluster) for a non-final cluster', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 8 },
      { cluster: 2, xAdvance: 7 },
      { cluster: 4, xAdvance: 9 },
    ]);
    expect(getIndexRangeForCluster(run, 0)).toEqual([0, 2]);
    expect(getIndexRangeForCluster(run, 2)).toEqual([2, 4]);
  });

  it('uses stringLength for the final cluster end when provided', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 8 },
      { cluster: 2, xAdvance: 7 },
    ]);
    expect(getIndexRangeForCluster(run, 2, 6)).toEqual([2, 6]);
  });

  it('estimates final cluster end as cluster + 1 when stringLength is absent', () => {
    const run = _makeRun([
      { cluster: 0, xAdvance: 8 },
      { cluster: 2, xAdvance: 7 },
    ]);
    expect(getIndexRangeForCluster(run, 2)).toEqual([2, 3]);
  });
});
