import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { martinezPathBooleanKernel } from './martinezKernel.ts';
import { unionAllPaths } from './unionAllPaths.ts';

const kernel = martinezPathBooleanKernel;

function squarePath(x: number, y: number, s: number): Path {
  const path = createPath('nonZero');
  appendPathMoveTo(path, x, y);
  appendPathLineTo(path, x + s, y);
  appendPathLineTo(path, x + s, y + s);
  appendPathLineTo(path, x, y + s);
  appendPathClose(path);
  return path;
}

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

describe('unionAllPaths', () => {
  it('returns an empty path for an empty list', () => {
    const result = unionAllPaths(kernel, []);
    expect(result.commands).toHaveLength(0);
    expect(result.data).toHaveLength(0);
  });

  it('simplifies a single self-overlapping path', () => {
    const overlap = createPath('nonZero');
    appendPathMoveTo(overlap, 0, 0);
    appendPathLineTo(overlap, 4, 0);
    appendPathLineTo(overlap, 4, 4);
    appendPathLineTo(overlap, 0, 4);
    appendPathClose(overlap);
    appendPathMoveTo(overlap, 2, 2);
    appendPathLineTo(overlap, 6, 2);
    appendPathLineTo(overlap, 6, 6);
    appendPathLineTo(overlap, 2, 6);
    appendPathClose(overlap);
    const result = unionAllPaths(kernel, [overlap]);
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(28, 6);
  });

  it('merges a list of overlapping squares into one outline', () => {
    const result = unionAllPaths(kernel, [squarePath(0, 0, 10), squarePath(5, 5, 10), squarePath(8, 8, 10)]);
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeGreaterThan(100);
    expect(pathArea(result)).toBeLessThan(300);
  });

  it('keeps disjoint squares as separate rings summing their areas', () => {
    const result = unionAllPaths(kernel, [squarePath(0, 0, 10), squarePath(20, 20, 10), squarePath(40, 0, 10)]);
    expect(ringCount(result)).toBe(3);
    expect(pathArea(result)).toBeCloseTo(300, 6);
  });

  it('folds order-independently (union is commutative across the list)', () => {
    const a = squarePath(0, 0, 10);
    const b = squarePath(5, 5, 10);
    const c = squarePath(2, 8, 10);
    const forward = unionAllPaths(kernel, [a, b, c]);
    const reversed = unionAllPaths(kernel, [c, b, a]);
    expect(pathArea(forward)).toBeCloseTo(pathArea(reversed), 6);
    expect(ringCount(forward)).toBe(ringCount(reversed));
  });

  it('writes into a provided out path that aliases an input', () => {
    const a = squarePath(0, 0, 10);
    const b = squarePath(5, 5, 10);
    const result = unionAllPaths(kernel, [a, b], a);
    expect(result).toBe(a);
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(175, 6);
  });
});
