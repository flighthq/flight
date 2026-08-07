import { describe, expect, it } from 'vitest';

import {
  classifyHeadBoundsDeltas,
  compareContourCount,
  contoursWindOppositely,
  measureDecodedBoundsAgainstHead,
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

  it('reports exceeds on any single edge, which is the only definite defect', () => {
    for (const edge of ['xMax', 'xMin', 'yMax', 'yMin'] as const) {
      expect(classifyHeadBoundsDeltas({ xMax: -1, xMin: -1, yMax: -1, yMin: -1, [edge]: 1 })).toBe('exceeds');
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
