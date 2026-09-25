import { createPath, appendPathClose, appendPathLineTo, appendPathMoveTo, flattenPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { martinezPathBooleanKernel } from './martinezKernel.ts';
import { offsetPath } from './offsetPath.ts';
import { simplifyPath } from './simplifyPath.ts';

const kernel = martinezPathBooleanKernel;

function polygonPath(vertices: readonly number[], closed: boolean): Path {
  const path = createPath('nonZero');
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) appendPathLineTo(path, vertices[i], vertices[i + 1]);
  if (closed) appendPathClose(path);
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
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
    }
    total += area / 2;
  }
  return Math.abs(total);
}

function pathVertexCount(path: Readonly<Path>): number {
  let count = 0;
  for (const ring of flattenPath(path)) count += ring.length / 2;
  return count;
}

function ringCount(path: Readonly<Path>): number {
  return flattenPath(path).length;
}

const UNIT_SQUARE = [0, 0, 1, 0, 1, 1, 0, 1];

describe('offsetPath', () => {
  it('writes into an existing output and is alias-safe', () => {
    const path = polygonPath([0, 0, 4, 0, 4, 4, 0, 4], true);
    const result = offsetPath(kernel, path, 1, undefined, path);

    expect(result).toBe(path);
    expect(pathBounds(path)).toEqual({ minX: -1, minY: -1, maxX: 5, maxY: 5 });
  });

  it('inflates a closed square by delta on every side with a miter join', () => {
    const result = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.minY).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(bounds.maxY).toBeCloseTo(2, 6);
    expect(pathArea(result)).toBeCloseTo(9, 4);
  });

  it('deflates a closed square on a negative delta', () => {
    const result = offsetPath(kernel, polygonPath([0, 0, 4, 0, 4, 4, 0, 4], true), -1);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(1, 6);
    expect(bounds.minY).toBeCloseTo(1, 6);
    expect(bounds.maxX).toBeCloseTo(3, 6);
    expect(bounds.maxY).toBeCloseTo(3, 6);
    expect(pathArea(result)).toBeCloseTo(4, 4);
  });

  it('emits an empty path when deflation collapses the region', () => {
    const result = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), -1);
    expect(result.commands.length).toBe(0);
    expect(pathArea(result)).toBe(0);
  });

  it('chamfers corners with a bevel join', () => {
    const result = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, { join: 'bevel' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(pathArea(result)).toBeCloseTo(7, 4);
  });

  it('rounds corners with a round join and tessellates denser with radius and finer tolerance', () => {
    const rounded = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, { join: 'round' });
    const bounds = pathBounds(rounded);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    const fineArea = pathArea(
      offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, { join: 'round', arcTolerance: 0.001 }),
    );
    expect(fineArea).toBeCloseTo(5 + Math.PI, 1);

    const largeRadius = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 5, { join: 'round' });
    expect(pathVertexCount(largeRadius)).toBeGreaterThan(pathVertexCount(rounded));

    const fineTolerance = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, {
      join: 'round',
      arcTolerance: 0.01,
    });
    expect(pathVertexCount(fineTolerance)).toBeGreaterThan(pathVertexCount(rounded));
  });

  it('falls back to a bevel when a sharp miter exceeds the miter limit', () => {
    const wedge = [0, 0, 4, 0.5, 4, -0.5];
    const clipped = offsetPath(kernel, polygonPath(wedge, true), 1, { miterLimit: 2 });
    const sharp = offsetPath(kernel, polygonPath(wedge, true), 1, { miterLimit: 50 });
    expect(pathBounds(clipped).minX).toBeGreaterThan(pathBounds(sharp).minX + 3);
    expect(pathBounds(sharp).minX).toBeLessThan(-5);
  });

  it('squares corners with a square join', () => {
    const result = offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, { join: 'square' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(pathArea(result)).toBeCloseTo(9, 4);
    expect(pathArea(result)).toBeGreaterThan(
      pathArea(offsetPath(kernel, polygonPath(UNIT_SQUARE, true), 1, { join: 'bevel' })),
    );
  });

  it('cleans a concave corner into a single valid outline', () => {
    const lShape = [0, 0, 2, 0, 2, 2, 1, 2, 1, 1, 0, 1];
    const result = offsetPath(kernel, polygonPath(lShape, true), 0.25);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-0.25, 6);
    expect(bounds.minY).toBeCloseTo(-0.25, 6);
    expect(bounds.maxX).toBeCloseTo(2.25, 6);
    expect(bounds.maxY).toBeCloseTo(2.25, 6);
    expect(result.commands.filter((c) => c === 1).length).toBe(1);
    expect(pathArea(result)).toBeGreaterThan(3);
  });

  it('closes a concave slot narrower than 2·delta into a valid self-intersection-free outline', () => {
    const uShape = [0, 0, 10, 0, 10, 10, 5.5, 10, 5.5, 3, 4.5, 3, 4.5, 10, 0, 10];
    const result = offsetPath(kernel, polygonPath(uShape, true), 1);
    expect(ringCount(result)).toBe(1);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(11, 6);
    expect(bounds.minY).toBeCloseTo(-1, 6);
    expect(bounds.maxY).toBeCloseTo(11, 6);
    const simplified = simplifyPath(kernel, result, { fillRule: 'nonZero' });
    expect(ringCount(simplified)).toBe(ringCount(result));
    expect(pathArea(simplified)).toBeCloseTo(pathArea(result), 4);
  });

  it('offsets consistently across a 1e9 span of coordinate scales (magnitude-relative epsilons)', () => {
    const lShape = (s: number): number[] => [0, 0, 2 * s, 0, 2 * s, 2 * s, s, 2 * s, s, s, 0, s];
    const at = (s: number): Readonly<Path> => polygonPath(lShape(s), true);
    const small = offsetPath(kernel, at(1e-3), 0.25e-3);
    const mid = offsetPath(kernel, at(1), 0.25);
    const large = offsetPath(kernel, at(1e6), 0.25e6);
    expect(ringCount(small)).toBe(ringCount(mid));
    expect(ringCount(large)).toBe(ringCount(mid));
    expect(pathArea(small) / 1e-3 ** 2).toBeCloseTo(pathArea(mid), 4);
    expect(pathArea(large) / (1e6 * 1e6)).toBeCloseTo(pathArea(mid), 4);
  });

  it('strokes an open path into a butt-capped rectangle', () => {
    const result = offsetPath(kernel, polygonPath([0, 0, 2, 0], false), 0.5, { end: 'butt' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(0, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(bounds.minY).toBeCloseTo(-0.5, 6);
    expect(bounds.maxY).toBeCloseTo(0.5, 6);
    expect(pathArea(result)).toBeCloseTo(2, 4);
  });

  it('extends an open path past its ends with a square cap', () => {
    const result = offsetPath(kernel, polygonPath([0, 0, 2, 0], false), 0.5, { end: 'square' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-0.5, 6);
    expect(bounds.maxX).toBeCloseTo(2.5, 6);
    expect(pathArea(result)).toBeCloseTo(3, 4);
  });

  it('caps an open path with half-circles on a round end', () => {
    const result = offsetPath(kernel, polygonPath([0, 0, 2, 0], false), 0.5, { end: 'round', arcTolerance: 0.001 });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-0.5, 2);
    expect(bounds.maxX).toBeCloseTo(2.5, 2);
    expect(pathArea(result)).toBeCloseTo(2 + Math.PI * 0.25, 2);
  });

  it('offsets the same vertices differently as an open vs a closed contour', () => {
    const vertices = [0, 0, 2, 0, 2, 2, 0, 2];
    const closed = offsetPath(kernel, polygonPath(vertices, true), 0.5);
    const open = offsetPath(kernel, polygonPath(vertices, false), 0.5, { end: 'butt' });
    expect(pathArea(closed)).toBeCloseTo(9, 4);
    expect(pathArea(open)).toBeLessThan(pathArea(closed));
  });
});
