// Generated from crates/flight-path-boolean/tests/union_all_paths_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import {
  appendPathClose,
  appendPathLineTo,
  appendPathMoveTo,
  clonePath,
  createPath,
  flattenPath,
} from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { createMartinezPathBooleanKernel, unionAllPaths } from './contract.ts';

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

function squarePath(x: number, y: number, s: number): Path {
  let path = createPath('nonZero');
  appendPathMoveTo(path, x, y);
  appendPathLineTo(path, x + s, y);
  appendPathLineTo(path, x + s, y + s);
  appendPathLineTo(path, x, y + s);
  appendPathClose(path);
  return path;
}

function pathArea(path: Readonly<Path>): number {
  let total: number = 0.0;
  for (const ring of flattenedPath(path, 0.25)) {
    let area: number = 0.0;
    const n = ring.length >> 1;
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
      j = i;
    }
    total += area / 2.0;
  }
  return Math.abs(total);
}

function ringCount(path: Readonly<Path>): number {
  return flattenedPath(path, 0.25).length;
}

describe('unionAllPaths', () => {
  it('supports geometry clone form for a later list input', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = squarePath(0.0, 0.0, 10.0);
    let b = squarePath(5.0, 5.0, 10.0);
    const snapshot = clonePath(b);
    unionAllPaths(b, kernel, [a, snapshot], undefined);
    expect(Math.abs(pathArea(b) - 175.0) < 0.1).toBe(true);
  });
  it('returns an empty path for an empty list', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    unionAllPaths(out, kernel, [], undefined);
    expect(out.commands.length).toEqual(0);
    expect(out.data.length).toEqual(0);
  });
  it('simplifies a single self overlapping path', () => {
    const kernel = createMartinezPathBooleanKernel();
    let overlap = createPath('nonZero');
    appendPathMoveTo(overlap, 0.0, 0.0);
    appendPathLineTo(overlap, 4.0, 0.0);
    appendPathLineTo(overlap, 4.0, 4.0);
    appendPathLineTo(overlap, 0.0, 4.0);
    appendPathClose(overlap);
    appendPathMoveTo(overlap, 2.0, 2.0);
    appendPathLineTo(overlap, 6.0, 2.0);
    appendPathLineTo(overlap, 6.0, 6.0);
    appendPathLineTo(overlap, 2.0, 6.0);
    appendPathClose(overlap);
    let out = createPath('nonZero');
    unionAllPaths(out, kernel, [overlap], undefined);
    expect(ringCount(out)).toEqual(1);
    expect(Math.abs(pathArea(out) - 28.0) < 5e-7).toBe(true);
  });
  it('merges a list of overlapping squares into one outline', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = squarePath(0.0, 0.0, 10.0);
    const b = squarePath(5.0, 5.0, 10.0);
    const c = squarePath(8.0, 8.0, 10.0);
    let out = createPath('nonZero');
    unionAllPaths(out, kernel, [a, b, c], undefined);
    expect(ringCount(out)).toEqual(1);
    expect(pathArea(out) > 100.0).toBe(true);
    expect(pathArea(out) < 300.0).toBe(true);
  });
  it('keeps disjoint squares as separate rings', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = squarePath(0.0, 0.0, 10.0);
    const b = squarePath(20.0, 20.0, 10.0);
    const c = squarePath(40.0, 0.0, 10.0);
    let out = createPath('nonZero');
    unionAllPaths(out, kernel, [a, b, c], undefined);
    expect(ringCount(out)).toEqual(3);
    expect(Math.abs(pathArea(out) - 300.0) < 5e-7).toBe(true);
  });
  it('folds order independently', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = squarePath(0.0, 0.0, 10.0);
    const b = squarePath(5.0, 5.0, 10.0);
    const c = squarePath(2.0, 8.0, 10.0);
    let forward = createPath('nonZero');
    let reversed = createPath('nonZero');
    unionAllPaths(forward, kernel, [a, b, c], undefined);
    unionAllPaths(reversed, kernel, [c, b, a], undefined);
    expect(Math.abs(pathArea(forward) - pathArea(reversed)) < 5e-7).toBe(true);
    expect(ringCount(forward)).toEqual(ringCount(reversed));
  });
  it('writes into an existing path using a distinct input snapshot', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = squarePath(0.0, 0.0, 10.0);
    const b = squarePath(5.0, 5.0, 10.0);
    const aClone = a;
    unionAllPaths(a, kernel, [aClone, b], undefined);
    expect(ringCount(a)).toEqual(1);
    expect(Math.abs(pathArea(a) - 175.0) < 5e-7).toBe(true);
  });
});
