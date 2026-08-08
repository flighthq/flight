import { describe, expect, it } from 'vitest';

import {
  collectWoff2ReversalPairs,
  encoderPreservedOutline,
  formatWoff2ReversalOracleReport,
  measureWoff2ReconstructedOutlines,
  measureWoff2ReversalPair,
  readSfntGlyphOutline,
  readWoff2RawTables,
  runWoff2ReversalOracle,
} from './woff2-reversal-oracle';

describe('encoderPreservedOutline', () => {
  const outline = { endPtsOfContours: [2], onCurve: [true, false, true], xs: [0, 5, 10], ys: [0, 5, 0] };

  it('accepts an outline that survived a re-encode unchanged', () => {
    expect(encoderPreservedOutline(outline, { ...outline })).toBe(true);
  });

  it('rejects an inverted curve flag, which a byte-length comparison would miss', () => {
    // The failure this exists to catch: same point count, same coordinates, every curve turned into a
    // corner. The record is the same size, so only a geometry comparison sees it.
    expect(encoderPreservedOutline(outline, { ...outline, onCurve: [false, true, false] })).toBe(false);
  });
});

describe('measureWoff2ReversalPair', () => {
  it('returns the skip sentinel for bytes that are not a WOFF2 at all', () => {
    expect(measureWoff2ReversalPair(new Uint8Array(64), new Uint8Array(64))).toBeNull();
  });
});

describe('readSfntGlyphOutline', () => {
  it('returns the sentinel rather than throwing on bytes that are not a font', () => {
    expect(readSfntGlyphOutline(new Uint8Array(64), 0)).toBeNull();
  });
});

describe('readWoff2RawTables', () => {
  it('returns the sentinel when the bytes carry no WOFF2 directory', () => {
    expect(readWoff2RawTables(new Uint8Array(64))).toBeNull();
  });
});

describe('runWoff2ReversalOracle', () => {
  it('reports no pairs rather than failing when the fixture pool is absent', () => {
    // The oracle needs fonts that are deliberately NOT committed, so it must be honest about measuring
    // nothing rather than report an all-clear over an empty corpus.
    const result = runWoff2ReversalOracle([]);
    expect(result.pairs).toBe(0);
    expect(result.totals.simpleGlyphs).toBe(0);
    expect(result.totals.highMeansOffCurve).toBe(0);
  });

  it('drops a pair it cannot open instead of counting it as measured', () => {
    const result = runWoff2ReversalOracle([{ ttf: new Uint8Array(64), woff2: new Uint8Array(64) }]);
    expect(result.pairs).toBe(0);
  });
});

describe('formatWoff2ReversalOracleReport', () => {
  it('prints the ground-truth class counts beside the agreement', () => {
    // Without them a perfect agreement cannot be told from a vacuous one, so they are not optional.
    const text = formatWoff2ReversalOracleReport(runWoff2ReversalOracle([]));
    expect(text).toContain('ground-truth classes');
    expect(text).toContain('pairs measured: 0');
  });
});

describe('collectWoff2ReversalPairs', () => {
  it('reports no pairs for a tree holding none, rather than throwing', () => {
    // The fonts are deliberately not committed, so an empty answer is the honest one here.
    expect(collectWoff2ReversalPairs('scripts').length).toBe(0);
  });
});

describe('measureWoff2ReconstructedOutlines', () => {
  it('returns the skip sentinel rather than a score for bytes that are not a font', () => {
    expect(measureWoff2ReconstructedOutlines(new Uint8Array(64), new Uint8Array(64))).toBeNull();
  });
});
