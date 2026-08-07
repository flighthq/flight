import { describe, expect, it } from 'vitest';

import {
  compareContourCount,
  compareDecodedBoundsToHead,
  contoursWindOppositely,
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

describe('compareDecodedBoundsToHead', () => {
  it('reports exact only when every edge matches', () => {
    expect(compareDecodedBoundsToHead(HEAD, HEAD)).toBe('exact');
  });

  it('reports contained as its own answer rather than as agreement', () => {
    // A weak pass: it cannot separate a loose declared box from a glyph the reader failed to draw.
    expect(compareDecodedBoundsToHead(HEAD, { xMax: 90, xMin: 0, yMax: 190, yMin: -10 })).toBe('contained');
  });

  it('reports exceeds on any single edge, which is the only definite defect', () => {
    for (const decoded of [
      { ...HEAD, xMin: -11 },
      { ...HEAD, yMin: -21 },
      { ...HEAD, xMax: 101 },
      { ...HEAD, yMax: 201 },
    ]) {
      expect(compareDecodedBoundsToHead(HEAD, decoded)).toBe('exceeds');
    }
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
    expect(woff2StreamRange(97, 11_383, 11_480)).toEqual({ end: 11_480, start: 97 });
  });

  it('returns the sentinel when the stream would run past the buffer', () => {
    expect(woff2StreamRange(97, 11_383, 11_000)).toBeNull();
  });

  it('returns the sentinel for a container declaring no compressed bytes', () => {
    expect(woff2StreamRange(97, 0, 11_480)).toBeNull();
  });
});
