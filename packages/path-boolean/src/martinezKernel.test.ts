import type { PathBooleanContour, PathBooleanFillRule, PathBooleanOperation } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMartinezPathBooleanBackend } from './martinezKernel';

// A closed square contour [x, y, x+s, y, x+s, y+s, x, y+s], wound consistently (screen y-down CW).
function square(x: number, y: number, s: number): number[] {
  return [x, y, x + s, y, x + s, y + s, x, y + s];
}

// A donut: an outer square with a reverse-wound inner square that cuts a hole under non-zero fill.
function donut(x: number, y: number, outer: number, inset: number, inner: number): number[][] {
  const ix = x + inset;
  const iy = y + inset;
  return [square(x, y, outer), [ix, iy, ix, iy + inner, ix + inner, iy + inner, ix + inner, iy]];
}

// Net filled area of a correctly-wound result: outer rings and holes carry opposite signs, so the
// signed-area sum is the true fill. Uses the shoelace sum without the abs-per-ring the geometry hides.
function netArea(rings: readonly PathBooleanContour[]): number {
  let total = 0;
  for (const ring of rings) total += signedArea(ring);
  return Math.abs(total);
}

function signedArea(ring: PathBooleanContour): number {
  let area = 0;
  const n = ring.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
  }
  return area / 2;
}

function boundsOf(rings: readonly PathBooleanContour[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      maxX = Math.max(maxX, ring[i]);
      minY = Math.min(minY, ring[i + 1]);
      maxY = Math.max(maxY, ring[i + 1]);
    }
  }
  return { minX, minY, maxX, maxY };
}

// Whether (x, y) is inside the result region under non-zero fill (holes counter-wound).
function fillContains(rings: readonly PathBooleanContour[], x: number, y: number): boolean {
  let winding = 0;
  for (const ring of rings) {
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

function run(
  subject: readonly number[][],
  clip: readonly number[][],
  operation: PathBooleanOperation,
  fillRule: PathBooleanFillRule = 'nonZero',
): readonly PathBooleanContour[] {
  return createMartinezPathBooleanBackend().computePathBoolean(subject, clip, operation, fillRule);
}

describe('createMartinezPathBooleanBackend', () => {
  describe('coincident and shared-boundary degeneracies', () => {
    it('unions two squares sharing a full edge into one rectangle', () => {
      const result = run([square(0, 0, 10)], [square(10, 0, 10)], 'union');
      expect(netArea(result)).toBeCloseTo(200, 6);
      expect(boundsOf(result)).toMatchObject({ minX: 0, maxX: 20, minY: 0, maxY: 10 });
      expect(fillContains(result, 10, 5)).toBe(true); // the former shared edge is now interior
    });

    it('intersects two squares sharing an edge to nothing (zero-width overlap)', () => {
      const result = run([square(0, 0, 10)], [square(10, 0, 10)], 'intersection');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });

    it('handles a partially overlapping shared edge (offset abutment)', () => {
      // Clip's left edge overlaps only the top half of subject's right edge.
      const result = run([square(0, 0, 10)], [[10, 5, 20, 5, 20, 15, 10, 15]], 'union');
      expect(netArea(result)).toBeCloseTo(200, 6);
      expect(fillContains(result, 10, 7)).toBe(true);
    });

    it('collapses two identical squares under union to a single square', () => {
      const result = run([square(0, 0, 10)], [square(0, 0, 10)], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('collapses two identical squares under intersection to the same square', () => {
      const result = run([square(0, 0, 10)], [square(0, 0, 10)], 'intersection');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('empties two identical squares under xor', () => {
      const result = run([square(0, 0, 10)], [square(0, 0, 10)], 'xor');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });

    it('empties a square differenced against an identical square', () => {
      const result = run([square(0, 0, 10)], [square(0, 0, 10)], 'difference');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });
  });

  describe('difference', () => {
    it('cuts a hole when the clip is fully contained', () => {
      const result = run([square(0, 0, 30)], [square(10, 10, 10)], 'difference');
      expect(netArea(result)).toBeCloseTo(800, 6);
      expect(result.length).toBe(2); // outer boundary + hole
      expect(fillContains(result, 2, 2)).toBe(true);
      expect(fillContains(result, 15, 15)).toBe(false); // inside the hole
    });

    it('subtracts a partial overlap', () => {
      const result = run([square(0, 0, 10)], [square(5, 5, 10)], 'difference');
      expect(netArea(result)).toBeCloseTo(75, 6);
      expect(fillContains(result, 2, 2)).toBe(true);
      expect(fillContains(result, 7, 7)).toBe(false);
    });

    it('is empty when subtracting a superset', () => {
      const result = run([square(10, 10, 10)], [square(0, 0, 30)], 'difference');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });
  });

  describe('disjoint inputs', () => {
    it('unions disjoint squares into two rings', () => {
      const result = run([square(0, 0, 10)], [square(20, 20, 10)], 'union');
      expect(netArea(result)).toBeCloseTo(200, 6);
      expect(result.length).toBe(2);
    });

    it('intersects disjoint squares to nothing', () => {
      const result = run([square(0, 0, 10)], [square(20, 20, 10)], 'intersection');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });

    it('xors disjoint squares to both squares', () => {
      const result = run([square(0, 0, 10)], [square(20, 20, 10)], 'xor');
      expect(netArea(result)).toBeCloseTo(200, 6);
    });
  });

  describe('empty and degenerate inputs', () => {
    it('returns empty for two empty operands', () => {
      expect(run([], [], 'union')).toEqual([]);
    });

    it('passes the subject through union with an empty clip', () => {
      const result = run([square(0, 0, 10)], [], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('empties intersection with an empty clip', () => {
      expect(netArea(run([square(0, 0, 10)], [], 'intersection'))).toBeCloseTo(0, 6);
    });

    it('ignores a zero-area (collinear) contour', () => {
      const degenerate = [0, 0, 10, 0, 5, 0]; // three collinear points, no area
      const result = run([square(0, 0, 10)], [degenerate], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('ignores a single-point contour', () => {
      const result = run([square(0, 0, 10)], [[5, 5, 5, 5, 5, 5]], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('ignores a contour with too few points', () => {
      const result = run([square(0, 0, 10)], [[1, 1, 2, 2]], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });
  });

  describe('holes', () => {
    it('unions a donut with an overlapping square, filling part of the hole', () => {
      const result = run(donut(0, 0, 30, 10, 10), [square(12, 12, 20)], 'union');
      // Donut is 30x30 minus a 10x10 hole (800); the union square (12,12)-(32,32) plugs the hole and
      // extends past the donut. Assert the former hole center is now filled and a hole corner sample
      // that the plug does not cover stays empty.
      expect(fillContains(result, 15, 15)).toBe(true); // plugged
      expect(fillContains(result, 11, 11)).toBe(false); // still a hole corner outside the plug
    });

    it('intersects a donut with a square covering its hole to a frame', () => {
      const result = run(donut(0, 0, 30, 10, 10), [square(5, 5, 20)], 'intersection');
      // Intersection keeps donut material within (5,5)-(25,25), which is a frame around the hole.
      expect(fillContains(result, 15, 15)).toBe(false); // the hole survives
      expect(fillContains(result, 8, 8)).toBe(true); // donut material inside the clip
    });

    it('differences a square from a donut, deepening the hole', () => {
      const result = run(donut(0, 0, 30, 5, 20), [square(10, 10, 10)], 'difference');
      // Donut hole is (5,5)-(25,25); subtracting (10,10)-(20,20) removes material only where it overlaps
      // the donut ring. Hole center stays empty; ring material outside the clip stays filled.
      expect(fillContains(result, 15, 15)).toBe(false);
      expect(fillContains(result, 2, 2)).toBe(true);
    });
  });

  describe('self-intersecting input and fill rules', () => {
    it('fills the overlap of two same-wound squares under non-zero (winding 2)', () => {
      const result = run([square(0, 0, 10), square(5, 5, 10)], [], 'union', 'nonZero');
      expect(netArea(result)).toBeCloseTo(175, 6);
      expect(fillContains(result, 7, 7)).toBe(true); // overlap filled
      expect(result.length).toBe(1); // one solid outline, no hole
    });

    it('holes out the overlap of two same-wound squares under even-odd', () => {
      const result = run([square(0, 0, 10), square(5, 5, 10)], [], 'union', 'evenOdd');
      expect(netArea(result)).toBeCloseTo(150, 6);
      expect(fillContains(result, 7, 7)).toBe(false); // overlap is a hole
      expect(fillContains(result, 2, 2)).toBe(true); // non-overlap stays filled
    });

    it('treats a bowtie contour under non-zero as its two filled lobes', () => {
      // A self-crossing quad (0,0)-(10,0)-(0,10)-(10,10): the diagonals cross at (5,5) forming two
      // triangles. Under non-zero the opposite-wound lobes each fill.
      const bowtie = [0, 0, 10, 0, 0, 10, 10, 10];
      const result = run([bowtie], [], 'union', 'nonZero');
      expect(fillContains(result, 5, 1)).toBe(true); // lower lobe
      expect(fillContains(result, 5, 9)).toBe(true); // upper lobe
      expect(fillContains(result, 1, 5)).toBe(false); // between lobes, outside
    });
  });

  describe('positive and negative fill rules', () => {
    it('keeps a counter-clockwise (positively-wound) region under positive fill, drops it under negative', () => {
      const ccw = square(0, 0, 10); // shoelace-positive winding
      expect(netArea(run([ccw], [], 'union', 'positive'))).toBeCloseTo(100, 6);
      expect(netArea(run([ccw], [], 'union', 'negative'))).toBeCloseTo(0, 6);
    });

    it('mirrors that for a clockwise (negatively-wound) region', () => {
      const cw = [0, 0, 0, 10, 10, 10, 10, 0]; // reversed traversal, shoelace-negative winding
      expect(netArea(run([cw], [], 'union', 'negative'))).toBeCloseTo(100, 6);
      expect(netArea(run([cw], [], 'union', 'positive'))).toBeCloseTo(0, 6);
    });

    it('dissolves a same-wound self-overlap under positive fill (winding 2 stays filled)', () => {
      // The offset-cleanup fill: two overlapping same-wound squares fill solid (area 175, one ring), the
      // doubly-wound overlap kept rather than holed — this is why offsetPath resolves under positive.
      const result = run([square(0, 0, 10), square(5, 5, 10)], [], 'union', 'positive');
      expect(netArea(result)).toBeCloseTo(175, 6);
      expect(result.length).toBe(1);
      expect(fillContains(result, 7, 7)).toBe(true);
    });
  });

  describe('scale invariance', () => {
    it('resolves the same topology and scale-relative area across a 1e9 span of coordinate scales', () => {
      // Two overlapping squares — a real interior crossing, the regime where the vertex-merge snap
      // matters. Scaling the coordinates must not change the ring count nor the area-relative-to-scale²;
      // the magnitude-relative snap is what makes the resolved topology invariant to coordinate scale.
      const overlap = (s: number): number[][] => [square(0, 0, 10 * s), square(5 * s, 5 * s, 10 * s)];
      const small = run(overlap(1e-3), [], 'union', 'nonZero');
      const mid = run(overlap(1), [], 'union', 'nonZero');
      const large = run(overlap(1e6), [], 'union', 'nonZero');
      expect(small.length).toBe(mid.length);
      expect(large.length).toBe(mid.length);
      // Union of the two squares is one solid ring of area 175 at unit scale; area scales with s².
      expect(netArea(mid)).toBeCloseTo(175, 6);
      expect(netArea(small) / 1e-3 ** 2).toBeCloseTo(175, 4);
      expect(netArea(large) / (1e6 * 1e6)).toBeCloseTo(175, 4);
    });
  });

  describe('shared single vertex (corner touching)', () => {
    it('unions two corner-touching squares to their combined area', () => {
      const result = run([square(0, 0, 10)], [square(10, 10, 10)], 'union');
      expect(netArea(result)).toBeCloseTo(200, 6);
      expect(fillContains(result, 5, 5)).toBe(true);
      expect(fillContains(result, 15, 15)).toBe(true);
    });

    it('intersects two corner-touching squares to nothing', () => {
      const result = run([square(0, 0, 10)], [square(10, 10, 10)], 'intersection');
      expect(netArea(result)).toBeCloseTo(0, 6);
    });
  });

  describe('commutativity and symmetry', () => {
    it('unions commute', () => {
      const a = square(0, 0, 10);
      const b = square(5, 5, 10);
      expect(netArea(run([a], [b], 'union'))).toBeCloseTo(netArea(run([b], [a], 'union')), 6);
    });

    it('intersections commute', () => {
      const a = square(0, 0, 10);
      const b = square(3, 4, 10);
      expect(netArea(run([a], [b], 'intersection'))).toBeCloseTo(netArea(run([b], [a], 'intersection')), 6);
    });

    it('xor is symmetric', () => {
      const a = square(0, 0, 10);
      const b = square(4, 4, 10);
      expect(netArea(run([a], [b], 'xor'))).toBeCloseTo(netArea(run([b], [a], 'xor')), 6);
    });
  });

  describe('contained squares', () => {
    it('unions to the outer square', () => {
      const result = run([square(0, 0, 30)], [square(10, 10, 10)], 'union');
      expect(netArea(result)).toBeCloseTo(900, 6);
    });

    it('intersects to the inner square', () => {
      const result = run([square(0, 0, 30)], [square(10, 10, 10)], 'intersection');
      expect(netArea(result)).toBeCloseTo(100, 6);
    });

    it('xors to the outer-with-hole frame', () => {
      const result = run([square(0, 0, 30)], [square(10, 10, 10)], 'xor');
      expect(netArea(result)).toBeCloseTo(800, 6);
      expect(fillContains(result, 15, 15)).toBe(false);
      expect(fillContains(result, 2, 2)).toBe(true);
    });
  });

  describe('non-axis-aligned inputs', () => {
    it('unions two triangles sharing a diagonal into a square', () => {
      const lower = [0, 0, 10, 0, 10, 10]; // lower-right half of the unit-10 square
      const upper = [0, 0, 10, 10, 0, 10]; // upper-left half, sharing the (0,0)-(10,10) diagonal
      const result = run([lower], [upper], 'union');
      expect(netArea(result)).toBeCloseTo(100, 6);
      expect(fillContains(result, 5, 5)).toBe(true); // the former shared diagonal is interior
    });

    it('intersects two diagonal-sharing triangles to nothing', () => {
      const lower = [0, 0, 10, 0, 10, 10];
      const upper = [0, 0, 10, 10, 0, 10];
      expect(netArea(run([lower], [upper], 'intersection'))).toBeCloseTo(0, 6);
    });

    it('intersects a diamond overlapping a square (real crossing points)', () => {
      // Diamond centered on the square's right edge; only its left triangle (area 25) is inside.
      const diamond = [5, 5, 10, 0, 15, 5, 10, 10];
      const result = run([square(0, 0, 10)], [diamond], 'intersection');
      expect(netArea(result)).toBeCloseTo(25, 6);
      expect(fillContains(result, 8, 5)).toBe(true);
      expect(fillContains(result, 12, 5)).toBe(false);
    });

    it('unions a rotated square (diamond) with an overlapping axis square', () => {
      const diamond = [0, 10, 10, 0, 20, 10, 10, 20]; // area 200, centered (10,10)
      const result = run([square(0, 0, 12)], [diamond], 'union');
      // Both regions are inside the union; a point deep in each stays filled and the exterior stays out.
      expect(fillContains(result, 2, 2)).toBe(true); // square-only corner
      expect(fillContains(result, 18, 10)).toBe(true); // diamond-only tip region
      expect(fillContains(result, 19, 19)).toBe(false); // outside both
    });
  });
});
