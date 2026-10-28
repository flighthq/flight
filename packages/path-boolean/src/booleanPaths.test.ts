import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createPath, appendPathRectangle, flattenPath } from '@flighthq/path/contract';
import type { PathBooleanKernel, Path, PathWinding } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { booleanPaths, differencePaths, intersectPaths, unionPaths, xorPaths } from './booleanPaths.ts';
import { martinezPathBooleanKernel } from './martinezKernel.ts';

const kernel = martinezPathBooleanKernel;

function rectanglePath(x: number, y: number, w: number, h: number, winding: PathWinding = 'nonZero'): Path {
  const path = createPath(winding);
  appendPathRectangle(path, x, y, w, h);
  return path;
}

function pathFilledArea(path: Readonly<Path>): number {
  let total = 0;
  for (const ring of flattenPath(path)) {
    let area = 0;
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    }
    total += area / 2;
  }
  return Math.abs(total);
}

function pathFillContains(path: Readonly<Path>, x: number, y: number): boolean {
  let winding = 0;
  for (const ring of flattenPath(path)) {
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi <= y ? yj > y : yj <= y) {
        const t = (y - yi) / (yj - yi);
        if (x < xi + t * (xj - xi)) winding += yj > yi ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

describe('booleanPaths', () => {
  it('dispatches to the operation named in the argument', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    const union = createPath();
    const intersection = createPath();
    const difference = createPath();
    const xor = createPath();
    booleanPaths(union, kernel, a, b, 'union');
    booleanPaths(intersection, kernel, a, b, 'intersection');
    booleanPaths(difference, kernel, a, b, 'difference');
    booleanPaths(xor, kernel, a, b, 'xor');
    expect(pathFilledArea(union)).toBeCloseTo(175, 4);
    expect(pathFilledArea(intersection)).toBeCloseTo(25, 4);
    expect(pathFilledArea(difference)).toBeCloseTo(75, 4);
    expect(pathFilledArea(xor)).toBeCloseTo(150, 4);
  });

  it('writes into the required out path', () => {
    const out = createPath('evenOdd');
    booleanPaths(out, kernel, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10), 'union');
    expect(pathFilledArea(out)).toBeCloseTo(175, 4);
    expect(out.winding).toBe('nonZero');
  });

  it('is safe when out aliases the subject input', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    booleanPaths(a, kernel, a, b, 'union');
    expect(pathFilledArea(a)).toBeCloseTo(175, 4);
  });

  it('is safe when out aliases the clip input', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    booleanPaths(b, kernel, a, b, 'intersection');
    expect(pathFilledArea(b)).toBeCloseTo(25, 4);
  });

  it('honors the even-odd fill rule option on self-overlapping input', () => {
    const a = createPath('nonZero');
    appendPathRectangle(a, 0, 0, 10, 10);
    appendPathRectangle(a, 5, 5, 10, 10);
    const empty = createPath('nonZero');
    const nonZero = createPath();
    const evenOdd = createPath();
    booleanPaths(nonZero, kernel, a, empty, 'union', { fillRule: 'nonZero' });
    booleanPaths(evenOdd, kernel, a, empty, 'union', { fillRule: 'evenOdd' });
    expect(pathFilledArea(nonZero)).toBeCloseTo(175, 4);
    expect(pathFilledArea(evenOdd)).toBeCloseTo(150, 4);
  });

  it('accepts a coarser tolerance option without error', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    const out = createPath();
    booleanPaths(out, kernel, a, b, 'union', { tolerance: 2 });
    expect(pathFilledArea(out)).toBeCloseTo(175, 4);
  });
});

describe('differencePaths', () => {
  it('cuts a contained hole', () => {
    const result = createPath();
    differencePaths(result, kernel, rectanglePath(0, 0, 30, 30), rectanglePath(10, 10, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(800, 4);
    expect(pathFillContains(result, 15, 15)).toBe(false);
    expect(pathFillContains(result, 2, 2)).toBe(true);
  });

  it('is empty for a path differenced against itself', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(0, 0, 10, 10);
    const result = createPath();
    differencePaths(result, kernel, a, b);
    expect(pathFilledArea(result)).toBeCloseTo(0, 4);
  });
});

describe('intersectPaths', () => {
  it('keeps the overlap', () => {
    const result = createPath();
    intersectPaths(result, kernel, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(25, 4);
  });

  it('is empty for disjoint inputs', () => {
    const result = createPath();
    intersectPaths(result, kernel, rectanglePath(0, 0, 10, 10), rectanglePath(20, 20, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(0, 4);
  });
});

describe('unionPaths', () => {
  it('merges overlapping rectangles', () => {
    const result = createPath();
    unionPaths(result, kernel, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(175, 4);
  });

  it('commutes', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(4, 4, 10, 10);
    const ab = createPath();
    const ba = createPath();
    unionPaths(ab, kernel, a, b);
    unionPaths(ba, kernel, b, a);
    expect(pathFilledArea(ab)).toBeCloseTo(pathFilledArea(ba), 4);
  });

  it('routes through a provided kernel', () => {
    let seen = false;
    const custom = (() => {
      const out = allocateEntity<PathBooleanKernel>();
      out.computePathBoolean = () => {
        seen = true;
        return [];
      };
      return finishEntity(out);
    })();
    const result = createPath();
    unionPaths(result, custom, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(seen).toBe(true);
    expect(result.commands.length).toBe(0);
  });
});

describe('xorPaths', () => {
  it('keeps the symmetric difference', () => {
    const result = createPath();
    xorPaths(result, kernel, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(150, 4);
  });
});
