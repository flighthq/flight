import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createPath, appendPathRectangle, flattenPath } from '@flighthq/path/contract';
import type { HostPathBooleanProvider, Path, PathWinding } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { booleanPaths, differencePaths, intersectPaths, unionPaths, xorPaths } from './booleanPaths';
import { createDefaultPathBooleanBackend } from './pathBooleanBackend';

const backend = createDefaultPathBooleanBackend();

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
    expect(pathFilledArea(booleanPaths(backend, a, b, 'union'))).toBeCloseTo(175, 4);
    expect(pathFilledArea(booleanPaths(backend, a, b, 'intersection'))).toBeCloseTo(25, 4);
    expect(pathFilledArea(booleanPaths(backend, a, b, 'difference'))).toBeCloseTo(75, 4);
    expect(pathFilledArea(booleanPaths(backend, a, b, 'xor'))).toBeCloseTo(150, 4);
  });

  it('returns a fresh non-zero path when out is omitted', () => {
    const result = booleanPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(20, 20, 5, 5), 'union');
    expect(result.winding).toBe('nonZero');
    expect(result.commands.length).toBeGreaterThan(0);
  });

  it('writes into the provided out path and returns it', () => {
    const out = createPath('nonZero');
    const returned = booleanPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10), 'union', out);
    expect(returned).toBe(out);
    expect(pathFilledArea(out)).toBeCloseTo(175, 4);
  });

  it('is safe when out aliases the subject input', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    const result = booleanPaths(backend, a, b, 'union', a);
    expect(result).toBe(a);
    expect(pathFilledArea(result)).toBeCloseTo(175, 4);
  });

  it('is safe when out aliases the clip input', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    const result = booleanPaths(backend, a, b, 'intersection', b);
    expect(result).toBe(b);
    expect(pathFilledArea(result)).toBeCloseTo(25, 4);
  });

  it('honors the even-odd fill rule option on self-overlapping input', () => {
    const a = createPath('nonZero');
    appendPathRectangle(a, 0, 0, 10, 10);
    appendPathRectangle(a, 5, 5, 10, 10);
    const empty = createPath('nonZero');
    expect(pathFilledArea(booleanPaths(backend, a, empty, 'union', undefined, { fillRule: 'nonZero' }))).toBeCloseTo(
      175,
      4,
    );
    expect(pathFilledArea(booleanPaths(backend, a, empty, 'union', undefined, { fillRule: 'evenOdd' }))).toBeCloseTo(
      150,
      4,
    );
  });

  it('accepts a coarser tolerance option without error', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(5, 5, 10, 10);
    expect(pathFilledArea(booleanPaths(backend, a, b, 'union', undefined, { tolerance: 2 }))).toBeCloseTo(175, 4);
  });
});

describe('differencePaths', () => {
  it('cuts a contained hole', () => {
    const result = differencePaths(backend, rectanglePath(0, 0, 30, 30), rectanglePath(10, 10, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(800, 4);
    expect(pathFillContains(result, 15, 15)).toBe(false);
    expect(pathFillContains(result, 2, 2)).toBe(true);
  });

  it('is empty for a path differenced against itself', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(0, 0, 10, 10);
    expect(pathFilledArea(differencePaths(backend, a, b))).toBeCloseTo(0, 4);
  });
});

describe('intersectPaths', () => {
  it('keeps the overlap', () => {
    const result = intersectPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(25, 4);
  });

  it('is empty for disjoint inputs', () => {
    const result = intersectPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(20, 20, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(0, 4);
  });
});

describe('unionPaths', () => {
  it('merges overlapping rectangles', () => {
    const result = unionPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(175, 4);
  });

  it('commutes', () => {
    const a = rectanglePath(0, 0, 10, 10);
    const b = rectanglePath(4, 4, 10, 10);
    expect(pathFilledArea(unionPaths(backend, a, b))).toBeCloseTo(pathFilledArea(unionPaths(backend, b, a)), 4);
  });

  it('routes through a provided backend', () => {
    let seen = false;
    const custom = (() => {
      const out = allocateEntity<HostPathBooleanProvider>();
      out.computePathBoolean = () => {
        seen = true;
        return [];
      };
      return finishEntity(out);
    })();
    const result = unionPaths(custom, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(seen).toBe(true);
    expect(result.commands.length).toBe(0);
  });
});

describe('xorPaths', () => {
  it('keeps the symmetric difference', () => {
    const result = xorPaths(backend, rectanglePath(0, 0, 10, 10), rectanglePath(5, 5, 10, 10));
    expect(pathFilledArea(result)).toBeCloseTo(150, 4);
  });
});
