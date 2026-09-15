import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path/contract';
import type { Path, PathWinding } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createDefaultPathBooleanBackend } from './pathBooleanBackend';
import { simplifyPath } from './simplifyPath';

const backend = createDefaultPathBooleanBackend();

function polygonPath(vertices: readonly number[], winding: PathWinding = 'nonZero'): Path {
  const path = createPath(winding);
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) appendPathLineTo(path, vertices[i], vertices[i + 1]);
  appendPathClose(path);
  return path;
}

function pathBounds(path: Readonly<Path>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of flattenPath(path)) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      minY = Math.min(minY, ring[i + 1]);
      maxX = Math.max(maxX, ring[i]);
      maxY = Math.max(maxY, ring[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
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

function pentagramPath(radius: number, winding: PathWinding): Path {
  const order = [0, 2, 4, 1, 3];
  const vertices: number[] = [];
  for (const k of order) {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    vertices.push(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  return polygonPath(vertices, winding);
}

const BOWTIE = [0, 0, 2, 2, 2, 0, 0, 2];

const UNIT_SQUARE = [0, 0, 3, 0, 3, 3, 0, 3];

describe('simplifyPath', () => {
  it('writes into an existing output and is alias-safe', () => {
    const path = polygonPath(BOWTIE);
    const result = simplifyPath(backend, path, undefined, path);

    expect(result).toBe(path);
    expect(ringCount(path)).toBe(2);
    expect(pathArea(path)).toBeCloseTo(2, 6);
  });

  it('resolves a self-intersecting bowtie into two triangles', () => {
    const result = simplifyPath(backend, polygonPath(BOWTIE));
    expect(ringCount(result)).toBe(2);
    expect(pathArea(result)).toBeCloseTo(2, 6);
  });

  it('fills a self-overlapping region solid under nonZero', () => {
    const path = createPath('nonZero');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 4, 0);
    appendPathLineTo(path, 4, 4);
    appendPathLineTo(path, 0, 4);
    appendPathClose(path);
    appendPathMoveTo(path, 2, 2);
    appendPathLineTo(path, 6, 2);
    appendPathLineTo(path, 6, 6);
    appendPathLineTo(path, 2, 6);
    appendPathClose(path);
    const result = simplifyPath(backend, path, { fillRule: 'nonZero' });
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(28, 6);
  });

  it('punches an even-odd hole through a self-overlapping region', () => {
    const path = createPath('evenOdd');
    appendPathMoveTo(path, 0, 0);
    appendPathLineTo(path, 4, 0);
    appendPathLineTo(path, 4, 4);
    appendPathLineTo(path, 0, 4);
    appendPathClose(path);
    appendPathMoveTo(path, 2, 2);
    appendPathLineTo(path, 6, 2);
    appendPathLineTo(path, 6, 6);
    appendPathLineTo(path, 2, 6);
    appendPathClose(path);
    const result = simplifyPath(backend, path, { fillRule: 'evenOdd' });
    expect(pathArea(result)).toBeCloseTo(24, 6);
    expect(ringCount(result)).toBeGreaterThan(1);
  });

  it('fills a self-overlapping star solid under nonZero but hollow under evenOdd', () => {
    const solid = simplifyPath(backend, pentagramPath(10, 'nonZero'), { fillRule: 'nonZero' });
    const hollow = simplifyPath(backend, pentagramPath(10, 'evenOdd'), { fillRule: 'evenOdd' });
    expect(ringCount(solid)).toBe(1);
    expect(pathArea(solid)).toBeCloseTo(112.257, 2);
    expect(ringCount(hollow)).toBeGreaterThan(1);
    expect(pathArea(hollow)).toBeCloseTo(77.568, 2);
    expect(pathArea(hollow)).toBeLessThan(pathArea(solid));
  });

  it('passes an already-simple convex path through unchanged', () => {
    const result = simplifyPath(backend, polygonPath(UNIT_SQUARE));
    expect(ringCount(result)).toBe(1);
    expect(pathArea(result)).toBeCloseTo(9, 6);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(0, 6);
    expect(bounds.minY).toBeCloseTo(0, 6);
    expect(bounds.maxX).toBeCloseTo(3, 6);
    expect(bounds.maxY).toBeCloseTo(3, 6);
  });

  it('returns an empty path for empty input', () => {
    const result = simplifyPath(backend, createPath('nonZero'));
    expect(result.commands).toHaveLength(0);
    expect(result.data).toHaveLength(0);
  });

  it('returns an empty path for a degenerate zero-area contour', () => {
    const result = simplifyPath(backend, polygonPath([0, 0, 5, 0, 10, 0]));
    expect(result.commands).toHaveLength(0);
    expect(result.data).toHaveLength(0);
  });
});
