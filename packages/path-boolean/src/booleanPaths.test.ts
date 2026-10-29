// Generated from crates/flight-path-boolean/tests/boolean_paths_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { appendPathRectangle, clonePath, createPath, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  booleanPaths,
  createMartinezPathBooleanKernel,
  differencePaths,
  intersectPaths,
  unionPaths,
  xorPaths,
} from './contract.ts';
import type { PathBooleanContour, PathBooleanFillRule, PathBooleanOperation, PathBooleanOptions } from './contract.ts';

function flattenedPath(path: Readonly<Path>, tolerance: number | undefined): number[][] {
  const out = flattenPath(path, tolerance);
  return out;
}

function rectanglePath(x: number, y: number, w: number, h: number): Path {
  let path = createPath('nonZero');
  appendPathRectangle(path, x, y, w, h);
  return path;
}

function pathFilledArea(path: Readonly<Path>): number {
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

function pathFillContains(path: Readonly<Path>, x: number, y: number): boolean {
  let winding: number = 0;
  for (const ring of flattenedPath(path, 0.25)) {
    const n = ring.length >> 1;
    let j = n - 1;
    for (let i = 0; i < n; i += 1) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi <= y ? yj > y : yj <= y) {
        const t = (y - yi) / (yj - yi);
        if (x < xi + t * (xj - xi)) {
          winding += yj > yi ? 1 : -1;
        }
      }
      j = i;
    }
  }
  return winding !== 0;
}

describe('booleanPaths', () => {
  it('dispatches to the operation named in the argument', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    let out = createPath('nonZero');
    booleanPaths(out, kernel, a, b, 'union', undefined);
    expect(Math.abs(pathFilledArea(out) - 175.0) < 5e-5).toBe(true);
    booleanPaths(out, kernel, a, b, 'intersection', undefined);
    expect(Math.abs(pathFilledArea(out) - 25.0) < 5e-5).toBe(true);
    booleanPaths(out, kernel, a, b, 'difference', undefined);
    expect(Math.abs(pathFilledArea(out) - 75.0) < 5e-5).toBe(true);
    booleanPaths(out, kernel, a, b, 'xor', undefined);
    expect(Math.abs(pathFilledArea(out) - 150.0) < 5e-5).toBe(true);
  });
  it('returns a non zero winding path', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    booleanPaths(
      out,
      kernel,
      rectanglePath(0.0, 0.0, 10.0, 10.0),
      rectanglePath(20.0, 20.0, 5.0, 5.0),
      'union',
      undefined,
    );
    expect(out.winding).toEqual('nonZero');
    expect(out.commands.length > 0).toBe(true);
  });
  it('writes into the provided out path', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    booleanPaths(
      out,
      kernel,
      rectanglePath(0.0, 0.0, 10.0, 10.0),
      rectanglePath(5.0, 5.0, 10.0, 10.0),
      'union',
      undefined,
    );
    expect(Math.abs(pathFilledArea(out) - 175.0) < 5e-5).toBe(true);
  });
  it('reuses subject destination with a distinct source snapshot', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const aClone = a;
    booleanPaths(a, kernel, aClone, b, 'union', undefined);
    expect(Math.abs(pathFilledArea(a) - 175.0) < 0.1).toBe(true);
  });
  it('reuses clip destination with a distinct source snapshot', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const bClone = b;
    booleanPaths(b, kernel, a, bClone, 'intersection', undefined);
    expect(Math.abs(pathFilledArea(b) - 25.0) < 0.1).toBe(true);
  });
  it('honors the even odd fill rule option', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = createPath('nonZero');
    appendPathRectangle(a, 0.0, 0.0, 10.0, 10.0);
    appendPathRectangle(a, 5.0, 5.0, 10.0, 10.0);
    const empty = createPath('nonZero');
    const nzOpts: PathBooleanOptions = { fillRule: 'nonZero', tolerance: undefined } as const;
    const eoOpts: PathBooleanOptions = { fillRule: 'evenOdd', tolerance: undefined } as const;
    let out = createPath('nonZero');
    booleanPaths(out, kernel, a, empty, 'union', nzOpts);
    expect(Math.abs(pathFilledArea(out) - 175.0) < 5e-5).toBe(true);
    booleanPaths(out, kernel, a, empty, 'union', eoOpts);
    expect(Math.abs(pathFilledArea(out) - 150.0) < 5e-5).toBe(true);
  });
  it('accepts a coarser tolerance option without error', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const opts: PathBooleanOptions = { fillRule: undefined, tolerance: 2.0 };
    let out = createPath('nonZero');
    booleanPaths(out, kernel, a, b, 'union', opts);
    expect(Math.abs(pathFilledArea(out) - 175.0) < 5e-5).toBe(true);
  });
});

describe('differencePaths', () => {
  it('supports geometry clone form for first input', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(a);
    differencePaths(a, kernel, snapshot, b, undefined);
    expect(Math.abs(pathFilledArea(a) - 75.0) < 0.1).toBe(true);
    expect(!pathFillContains(a, 7.0, 7.0)).toBe(true);
    expect(pathFillContains(a, 2.0, 2.0)).toBe(true);
  });
  it('supports geometry clone form for second input', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(b);
    differencePaths(b, kernel, a, snapshot, undefined);
    expect(Math.abs(pathFilledArea(b) - 75.0) < 0.1).toBe(true);
    expect(!pathFillContains(b, 7.0, 7.0)).toBe(true);
    expect(pathFillContains(b, 2.0, 2.0)).toBe(true);
  });
  it('cuts a contained hole', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    differencePaths(out, kernel, rectanglePath(0.0, 0.0, 30.0, 30.0), rectanglePath(10.0, 10.0, 10.0, 10.0), undefined);
    expect(Math.abs(pathFilledArea(out) - 800.0) < 5e-5).toBe(true);
    expect(!pathFillContains(out, 15.0, 15.0)).toBe(true);
    expect(pathFillContains(out, 2.0, 2.0)).toBe(true);
  });
  it('is empty for a path differenced against itself', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let out = createPath('nonZero');
    differencePaths(out, kernel, a, b, undefined);
    expect(pathFilledArea(out) < 0.1).toBe(true);
  });
});

describe('intersectPaths', () => {
  it('supports geometry clone form for first input', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(a);
    intersectPaths(a, kernel, snapshot, b, undefined);
    expect(Math.abs(pathFilledArea(a) - 25.0) < 0.1).toBe(true);
    expect(pathFillContains(a, 7.0, 7.0)).toBe(true);
    expect(!pathFillContains(a, 2.0, 2.0)).toBe(true);
  });
  it('supports geometry clone form for second input', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(b);
    intersectPaths(b, kernel, a, snapshot, undefined);
    expect(Math.abs(pathFilledArea(b) - 25.0) < 0.1).toBe(true);
    expect(pathFillContains(b, 7.0, 7.0)).toBe(true);
    expect(!pathFillContains(b, 2.0, 2.0)).toBe(true);
  });
  it('keeps the overlap', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    intersectPaths(out, kernel, rectanglePath(0.0, 0.0, 10.0, 10.0), rectanglePath(5.0, 5.0, 10.0, 10.0), undefined);
    expect(Math.abs(pathFilledArea(out) - 25.0) < 5e-5).toBe(true);
  });
  it('is empty for disjoint inputs', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    intersectPaths(out, kernel, rectanglePath(0.0, 0.0, 10.0, 10.0), rectanglePath(20.0, 20.0, 10.0, 10.0), undefined);
    expect(pathFilledArea(out) < 0.1).toBe(true);
  });
});

describe('unionPaths', () => {
  function computeSentinelPathBoolean(
    _subject: Readonly<PathBooleanContour[]>,
    _clip: Readonly<PathBooleanContour[]>,
    _operation: PathBooleanOperation,
    _fillRule: PathBooleanFillRule,
  ): PathBooleanContour[] {
    return [[1.0, 2.0, 3.0, 4.0, 5.0, 6.0]];
  }
  it('supports geometry clone form for first input', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(a);
    unionPaths(a, kernel, snapshot, b, undefined);
    expect(Math.abs(pathFilledArea(a) - 175.0) < 0.1).toBe(true);
    expect(pathFillContains(a, 2.0, 2.0)).toBe(true);
    expect(pathFillContains(a, 12.0, 12.0)).toBe(true);
  });
  it('supports geometry clone form for second input', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(b);
    unionPaths(b, kernel, a, snapshot, undefined);
    expect(Math.abs(pathFilledArea(b) - 175.0) < 0.1).toBe(true);
    expect(pathFillContains(b, 2.0, 2.0)).toBe(true);
    expect(pathFillContains(b, 12.0, 12.0)).toBe(true);
  });
  it('routes through a provided kernel', () => {
    let custom = createMartinezPathBooleanKernel();
    custom.computePathBoolean = computeSentinelPathBoolean;
    let out = createPath('nonZero');
    unionPaths(out, custom, rectanglePath(0.0, 0.0, 10.0, 10.0), rectanglePath(5.0, 5.0, 10.0, 10.0), undefined);
    expect(out.data).toEqual([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
  });
  it('merges overlapping rectangles', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    unionPaths(out, kernel, rectanglePath(0.0, 0.0, 10.0, 10.0), rectanglePath(5.0, 5.0, 10.0, 10.0), undefined);
    expect(Math.abs(pathFilledArea(out) - 175.0) < 5e-5).toBe(true);
  });
  it('commutes', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(4.0, 4.0, 10.0, 10.0);
    let out1 = createPath('nonZero');
    let out2 = createPath('nonZero');
    unionPaths(out1, kernel, a, b, undefined);
    unionPaths(out2, kernel, b, a, undefined);
    expect(Math.abs(pathFilledArea(out1) - pathFilledArea(out2)) < 5e-5).toBe(true);
  });
});

describe('xorPaths', () => {
  it('supports geometry clone form for first input', () => {
    const kernel = createMartinezPathBooleanKernel();
    let a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    const b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(a);
    xorPaths(a, kernel, snapshot, b, undefined);
    expect(Math.abs(pathFilledArea(a) - 150.0) < 0.1).toBe(true);
    expect(!pathFillContains(a, 7.0, 7.0)).toBe(true);
    expect(pathFillContains(a, 2.0, 2.0)).toBe(true);
  });
  it('supports geometry clone form for second input', () => {
    const kernel = createMartinezPathBooleanKernel();
    const a = rectanglePath(0.0, 0.0, 10.0, 10.0);
    let b = rectanglePath(5.0, 5.0, 10.0, 10.0);
    const snapshot = clonePath(b);
    xorPaths(b, kernel, a, snapshot, undefined);
    expect(Math.abs(pathFilledArea(b) - 150.0) < 0.1).toBe(true);
    expect(!pathFillContains(b, 7.0, 7.0)).toBe(true);
    expect(pathFillContains(b, 2.0, 2.0)).toBe(true);
  });
  it('keeps the symmetric difference', () => {
    const kernel = createMartinezPathBooleanKernel();
    let out = createPath('nonZero');
    xorPaths(out, kernel, rectanglePath(0.0, 0.0, 10.0, 10.0), rectanglePath(5.0, 5.0, 10.0, 10.0), undefined);
    expect(Math.abs(pathFilledArea(out) - 150.0) < 5e-5).toBe(true);
  });
});
