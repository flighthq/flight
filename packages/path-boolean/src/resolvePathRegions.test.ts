import { flattenPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { resolvePathRegions } from './resolvePathRegions';

// Total absolute filled area of a path's flattened outline (sum of signed ring areas).
function pathArea(path: Readonly<Path>): number {
  let total = 0;
  for (const ring of flattenPath(path)) {
    let area = 0;
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    total += area / 2;
  }
  return Math.abs(total);
}

// Number of contours in a path's flattened outline.
function ringCount(path: Readonly<Path>): number {
  return flattenPath(path).length;
}

const SQUARE_A = [0, 0, 4, 0, 4, 4, 0, 4];
const SQUARE_B = [2, 2, 6, 2, 6, 6, 2, 6];

describe('resolvePathRegions', () => {
  it('returns an empty path for no rings', () => {
    const result = resolvePathRegions([], 'nonZero');
    expect(result.commands).toHaveLength(0);
    expect(result.data).toHaveLength(0);
    expect(result.winding).toBe('nonZero');
  });

  it('self-unions overlapping rings into one outline under nonZero', () => {
    const result = resolvePathRegions([SQUARE_A, SQUARE_B], 'nonZero');
    // Two 4x4 squares overlapping in a 2x2 corner: 16 + 16 - 4 = 28.
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(28, 6);
  });

  it('applies the fill rule to self-overlap under evenOdd', () => {
    const result = resolvePathRegions([SQUARE_A, SQUARE_B], 'evenOdd');
    // Even-odd punches the doubly-covered 2x2 corner out: (16 - 4) + (16 - 4) = 24.
    expect(pathArea(result)).toBeCloseTo(24, 6);
    expect(ringCount(result)).toBeGreaterThan(1);
  });
});
