import { describe, expect, it } from 'vitest';

import {
  accountsForWoff2BboxStream,
  classifyHeadBoundsDeltas,
  compareContourCount,
  contoursWindOppositely,
  measureDecodedBoundsAgainstHead,
  outlinesAreIdentical,
  tallyWoff2OnCurveSense,
  woff2StreamRange,
} from './font-oracles';

const HEAD = { xMax: 100, xMin: -10, yMax: 200, yMin: -20 };

describe('compareContourCount', () => {
  it('agrees when the emitted contours match what the glyph declares', () => {
    expect(compareContourCount(2, 2)).toBe('agree');
  });

  it('disagrees when they differ, which is the permutation a bounding box cannot see', () => {
    expect(compareContourCount(2, 1)).toBe('disagree');
  });

  it('skips composites rather than counting them as agreement', () => {
    // Their contours come from components, so folding them in would inflate the agreement figure
    // with glyphs nothing actually checked.
    expect(compareContourCount(-1, 0)).toBe('skipped-composite');
    expect(compareContourCount(-1, 5)).toBe('skipped-composite');
  });
});

describe('classifyHeadBoundsDeltas', () => {
  it('reports exact only when every edge sits on the declared bound', () => {
    expect(classifyHeadBoundsDeltas({ xMax: 0, xMin: 0, yMax: 0, yMin: 0 })).toBe('exact');
  });

  it('reports contained as its own answer rather than as agreement', () => {
    // A weak pass: it cannot separate a loose declared box from a glyph the reader failed to draw.
    expect(classifyHeadBoundsDeltas({ xMax: -10, xMin: -10, yMax: -10, yMin: -10 })).toBe('contained');
  });

  it('separates a sub-unit excess as its own outcome rather than as exact or contained', () => {
    // The real instance: a CFF face decoding xMin as -634.2000427 against a declared int16 -634.
    // Folded into `exact` it disappears; folded into `contained` it is misreported.
    expect(classifyHeadBoundsDeltas({ xMax: 0, xMin: 0.200_042_724_609_375, yMax: 0, yMin: 0 })).toBe(
      'within-head-representable-precision',
    );
  });

  it('bounds that outcome at one design unit, because int16 cannot explain more', () => {
    // Just under a unit is explicable by rounding a real coordinate to an integer field; a whole unit
    // is not, and must stay a defect. This is the line the band is not allowed to move.
    expect(classifyHeadBoundsDeltas({ xMax: 0, xMin: 0.999, yMax: 0, yMin: 0 })).toBe(
      'within-head-representable-precision',
    );
    expect(classifyHeadBoundsDeltas({ xMax: 0, xMin: 1, yMax: 0, yMin: 0 })).toBe('exceeds');
  });

  it('reports exceeds on any single edge, which is the only definite defect', () => {
    for (const edge of ['xMax', 'xMin', 'yMax', 'yMin'] as const) {
      // A whole unit or more on any single edge, which int16 quantisation cannot account for.
      expect(classifyHeadBoundsDeltas({ xMax: -1, xMin: -1, yMax: -1, yMin: -1, [edge]: 2 })).toBe('exceeds');
    }
  });
});

describe('measureDecodedBoundsAgainstHead', () => {
  it('returns how far outside each edge lies, so nothing the caller might group is discarded', () => {
    const declared = { xMax: 100, xMin: -10, yMax: 200, yMin: -20 };
    // Decoded reaches 5 beyond xMax and stops 3 short of yMin.
    const deltas = measureDecodedBoundsAgainstHead(declared, { xMax: 105, xMin: -10, yMax: 200, yMin: -17 });
    expect(deltas).toEqual({ xMax: 5, xMin: 0, yMax: 0, yMin: -3 });
  });

  it('keeps the magnitude a verdict would have thrown away', () => {
    const declared = { xMax: 0, xMin: 0, yMax: 0, yMin: 0 };
    const small = measureDecodedBoundsAgainstHead(declared, { xMax: 1, xMin: 0, yMax: 0, yMin: 0 });
    const large = measureDecodedBoundsAgainstHead(declared, { xMax: 900, xMin: 0, yMax: 0, yMin: 0 });
    // Both classify as `exceeds`; only the measurement separates a rounding slip from a decode fault.
    expect(classifyHeadBoundsDeltas(small)).toBe(classifyHeadBoundsDeltas(large));
    expect(small.xMax).not.toBe(large.xMax);
  });
});

describe('contoursWindOppositely', () => {
  it('accepts a counter wound against its outer contour', () => {
    expect(contoursWindOppositely([-360_000, 40_000])).toBe(true);
  });

  it('rejects a counter wound the same way, which fills the hole', () => {
    expect(contoursWindOppositely([-360_000, -40_000])).toBe(false);
  });

  it('accepts both contours reversed, which a nonzero fill renders identically', () => {
    // The negative control: flagging this would fire on a measured non-defect.
    expect(contoursWindOppositely([360_000, -40_000])).toBe(true);
  });

  it('rejects a single contour, which has nothing to wind against', () => {
    expect(contoursWindOppositely([100])).toBe(false);
  });
});

describe('woff2StreamRange', () => {
  it('starts at the directory end rather than back from the file end', () => {
    expect(woff2StreamRange(100, 400, 500)).toEqual({ end: 500, start: 100 });
  });

  it('returns the sentinel when the stream would run past the buffer', () => {
    expect(woff2StreamRange(100, 400, 499)).toBeNull();
  });

  it('returns the sentinel for a container declaring no compressed bytes', () => {
    expect(woff2StreamRange(100, 0, 500)).toBeNull();
  });
});

describe('accountsForWoff2BboxStream', () => {
  it('accepts a stream whose bitmap and boxes account for it exactly', () => {
    expect(accountsForWoff2BboxStream(220 + 589 * 8, 220, 589)).toBe(true);
  });

  it('rejects a bitmap rounded to a byte where the count needs a 32-bit round', () => {
    // 1741 glyphs: 218 bytes by byte-rounding, 220 by word-rounding. The short reading leaves two
    // bytes unaccounted, which is exactly the shift that puts every box one int16 out.
    expect(accountsForWoff2BboxStream(220 + 577 * 8, 218, 577)).toBe(false);
    expect(accountsForWoff2BboxStream(220 + 577 * 8, 220, 577)).toBe(true);
  });

  it('cannot distinguish the two roundings when the glyph count is a multiple of 32', () => {
    // Recorded because it bounds what this check can prove: at 1760 glyphs both rules give 220, so a
    // wrong reader passes. Any font used to test that seam needs a count that is NOT a multiple of 32.
    expect(accountsForWoff2BboxStream(220 + 10 * 8, 220, 10)).toBe(true);
  });
});

describe('outlinesAreIdentical', () => {
  const outline = { endPtsOfContours: [2], onCurve: [true, false, true], xs: [0, 5, 10], ys: [0, 5, 0] };

  it('accepts the same outline spelled twice', () => {
    expect(outlinesAreIdentical(outline, { ...outline })).toBe(true);
  });

  it('rejects a moved point, a changed curve flag, and a changed contour split', () => {
    expect(outlinesAreIdentical(outline, { ...outline, xs: [0, 6, 10] })).toBe(false);
    expect(outlinesAreIdentical(outline, { ...outline, onCurve: [true, true, true] })).toBe(false);
    expect(outlinesAreIdentical(outline, { ...outline, endPtsOfContours: [1] })).toBe(false);
  });

  it('rejects a different point count rather than comparing the common prefix', () => {
    expect(outlinesAreIdentical(outline, { ...outline, xs: [0, 5], ys: [0, 5], onCurve: [true, false] })).toBe(false);
  });
});

describe('tallyWoff2OnCurveSense', () => {
  it('scores the two senses against ground truth', () => {
    const flags = Uint8Array.from([0x00, 0x80, 0x00, 0x80]);
    const tally = tallyWoff2OnCurveSense(flags, [true, false, true, false]);
    expect(tally.highMeansOffCurve).toBe(4);
    expect(tally.highMeansOnCurve).toBe(0);
  });

  it('reports both class counts so a vacuous perfect score can be spotted', () => {
    // Every point on-curve and every high bit clear scores 4/4 for "high means off-curve" while
    // discriminating nothing. The class counts are what expose it.
    const tally = tallyWoff2OnCurveSense(Uint8Array.from([0, 0, 0, 0]), [true, true, true, true]);
    expect(tally.highMeansOffCurve).toBe(4);
    expect(tally.sfntOffCurveCount).toBe(0);
  });
});
