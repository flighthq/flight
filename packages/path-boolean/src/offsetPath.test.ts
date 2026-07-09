import { createPath, appendPathClose, appendPathLineTo, appendPathMoveTo, flattenPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { offsetPath } from './offsetPath';

// Builds a polygon path from a flat [x0, y0, ...] vertex list, closed or left open.
function polygonPath(vertices: readonly number[], closed: boolean): Path {
  const path = createPath('nonZero');
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) appendPathLineTo(path, vertices[i], vertices[i + 1]);
  if (closed) appendPathClose(path);
  return path;
}

// Axis-aligned bounds of a path's flattened outline.
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

// Absolute filled area of a path's flattened outline, summing signed ring areas.
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

// Total flattened vertex count across all contours — grows with round-arc tessellation density.
function pathVertexCount(path: Readonly<Path>): number {
  let count = 0;
  for (const ring of flattenPath(path)) count += ring.length / 2;
  return count;
}

const UNIT_SQUARE = [0, 0, 1, 0, 1, 1, 0, 1];

describe('offsetPath', () => {
  it('inflates a closed square by delta on every side with a miter join', () => {
    const result = offsetPath(polygonPath(UNIT_SQUARE, true), 1);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.minY).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(bounds.maxY).toBeCloseTo(2, 6);
    // Sharp miter corners keep the full 3x3 square.
    expect(pathArea(result)).toBeCloseTo(9, 4);
  });

  it('deflates a closed square on a negative delta', () => {
    const result = offsetPath(polygonPath([0, 0, 4, 0, 4, 4, 0, 4], true), -1);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(1, 6);
    expect(bounds.minY).toBeCloseTo(1, 6);
    expect(bounds.maxX).toBeCloseTo(3, 6);
    expect(bounds.maxY).toBeCloseTo(3, 6);
    expect(pathArea(result)).toBeCloseTo(4, 4);
  });

  it('emits an empty path when deflation collapses the region', () => {
    const result = offsetPath(polygonPath(UNIT_SQUARE, true), -1);
    expect(result.commands.length).toBe(0);
    expect(pathArea(result)).toBe(0);
  });

  it('chamfers corners with a bevel join', () => {
    const result = offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'bevel' });
    const bounds = pathBounds(result);
    // Bevel still reaches delta along each edge but cuts each corner triangle (area 0.5 each).
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(pathArea(result)).toBeCloseTo(7, 4);
  });

  it('rounds corners with a round join and tessellates denser with radius and finer tolerance', () => {
    const rounded = offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'round' });
    const bounds = pathBounds(rounded);
    // Corner arcs reach delta at their endpoints, so the bounds match the miter/bevel extent.
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    // Finely tessellated, the Minkowski sum of a unit square and a radius-1 disk: 1 + perimeter + pi.
    const fineArea = pathArea(offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'round', arcTolerance: 0.001 }));
    expect(fineArea).toBeCloseTo(5 + Math.PI, 1);

    const largeRadius = offsetPath(polygonPath(UNIT_SQUARE, true), 5, { join: 'round' });
    expect(pathVertexCount(largeRadius)).toBeGreaterThan(pathVertexCount(rounded));

    const fineTolerance = offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'round', arcTolerance: 0.01 });
    expect(pathVertexCount(fineTolerance)).toBeGreaterThan(pathVertexCount(rounded));
  });

  it('falls back to a bevel when a sharp miter exceeds the miter limit', () => {
    const wedge = [0, 0, 4, 0.5, 4, -0.5];
    const clipped = offsetPath(polygonPath(wedge, true), 1, { miterLimit: 2 });
    const sharp = offsetPath(polygonPath(wedge, true), 1, { miterLimit: 50 });
    // The acute apex miter runs ~8 units past the vertex; miterLimit 2 clips it to a bevel much closer in.
    expect(pathBounds(clipped).minX).toBeGreaterThan(pathBounds(sharp).minX + 3);
    // A generous limit keeps the long spike.
    expect(pathBounds(sharp).minX).toBeLessThan(-5);
  });

  it('squares corners with a square join', () => {
    const result = offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'square' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-1, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    // On a right-angle corner the squared extension lands exactly on the miter apex, filling the corner
    // (area 9) and keeping strictly more than the bevel chamfer (7).
    expect(pathArea(result)).toBeCloseTo(9, 4);
    expect(pathArea(result)).toBeGreaterThan(
      pathArea(offsetPath(polygonPath(UNIT_SQUARE, true), 1, { join: 'bevel' })),
    );
  });

  it('cleans a concave corner into a single valid outline', () => {
    const lShape = [0, 0, 2, 0, 2, 2, 1, 2, 1, 1, 0, 1];
    const result = offsetPath(polygonPath(lShape, true), 0.25);
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-0.25, 6);
    expect(bounds.minY).toBeCloseTo(-0.25, 6);
    expect(bounds.maxX).toBeCloseTo(2.25, 6);
    expect(bounds.maxY).toBeCloseTo(2.25, 6);
    // A single closed ring survives the self-union (one move-to command), and the area grew from 3.
    expect(result.commands.filter((c) => c === 1).length).toBe(1);
    expect(pathArea(result)).toBeGreaterThan(3);
  });

  it('strokes an open path into a butt-capped rectangle', () => {
    const result = offsetPath(polygonPath([0, 0, 2, 0], false), 0.5, { end: 'butt' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(0, 6);
    expect(bounds.maxX).toBeCloseTo(2, 6);
    expect(bounds.minY).toBeCloseTo(-0.5, 6);
    expect(bounds.maxY).toBeCloseTo(0.5, 6);
    expect(pathArea(result)).toBeCloseTo(2, 4);
  });

  it('extends an open path past its ends with a square cap', () => {
    const result = offsetPath(polygonPath([0, 0, 2, 0], false), 0.5, { end: 'square' });
    const bounds = pathBounds(result);
    expect(bounds.minX).toBeCloseTo(-0.5, 6);
    expect(bounds.maxX).toBeCloseTo(2.5, 6);
    expect(pathArea(result)).toBeCloseTo(3, 4);
  });

  it('caps an open path with half-circles on a round end', () => {
    const result = offsetPath(polygonPath([0, 0, 2, 0], false), 0.5, { end: 'round', arcTolerance: 0.001 });
    const bounds = pathBounds(result);
    // The arc tip is only reached within the arc tolerance, not to full float precision.
    expect(bounds.minX).toBeCloseTo(-0.5, 2);
    expect(bounds.maxX).toBeCloseTo(2.5, 2);
    // Central 2x1 rectangle plus two half-disks of radius 0.5.
    expect(pathArea(result)).toBeCloseTo(2 + Math.PI * 0.25, 2);
  });

  it('offsets the same vertices differently as an open vs a closed contour', () => {
    const vertices = [0, 0, 2, 0, 2, 2, 0, 2];
    const closed = offsetPath(polygonPath(vertices, true), 0.5);
    const open = offsetPath(polygonPath(vertices, false), 0.5, { end: 'butt' });
    // Closed inflates the filled square (3x3 = 9); open strokes a ring around the polyline only.
    expect(pathArea(closed)).toBeCloseTo(9, 4);
    expect(pathArea(open)).toBeLessThan(pathArea(closed));
  });
});
