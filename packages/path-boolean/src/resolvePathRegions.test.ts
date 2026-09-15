import { flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDefaultPathBooleanBackend } from './pathBooleanBackend';
import { resolvePathRegions } from './resolvePathRegions';

const backend = createDefaultPathBooleanBackend();

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

function ringCount(path: Readonly<Path>): number {
  return flattenPath(path).length;
}

const SQUARE_A = [0, 0, 4, 0, 4, 4, 0, 4];
const SQUARE_B = [2, 2, 6, 2, 6, 6, 2, 6];

describe('resolvePathRegions', () => {
  it('returns an empty path for no rings', () => {
    const result = resolvePathRegions(backend, [], 'nonZero');
    expect(result.commands).toHaveLength(0);
    expect(result.data).toHaveLength(0);
    expect(result.winding).toBe('nonZero');
  });

  it('self-unions overlapping rings into one outline under nonZero', () => {
    const result = resolvePathRegions(backend, [SQUARE_A, SQUARE_B], 'nonZero');
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(28, 6);
  });

  it('applies the fill rule to self-overlap under evenOdd', () => {
    const result = resolvePathRegions(backend, [SQUARE_A, SQUARE_B], 'evenOdd');
    expect(pathArea(result)).toBeCloseTo(24, 6);
    expect(ringCount(result)).toBeGreaterThan(1);
  });
});
