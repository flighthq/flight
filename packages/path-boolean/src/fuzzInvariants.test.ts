import { appendPathClose, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { differencePaths, unionPaths } from './booleanPaths';
import { offsetPath } from './offsetPath';
import { simplifyPath } from './simplifyPath';
import { unionAllPaths } from './unionAllPaths';

// Deterministic xorshift32 PRNG. Seeded by a constant so every fuzz case is reproducible run to run — a
// failing invariant always reproduces from the same seed. Never uses Math.random.
function makeRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

// Builds a closed polygon path from a flat [x0, y0, ...] vertex list.
function polygonPath(vertices: readonly number[]): Path {
  const path = createPath('nonZero');
  appendPathMoveTo(path, vertices[0], vertices[1]);
  for (let i = 2; i < vertices.length; i += 2) appendPathLineTo(path, vertices[i], vertices[i + 1]);
  appendPathClose(path);
  return path;
}

// A simple (non-self-intersecting) star-shaped polygon: distinct sorted angles about a center, each at a
// random radius. Sorting the angles guarantees the boundary never crosses itself.
function randomSimplePolygon(random: () => number, count: number): number[] {
  const angles: number[] = [];
  for (let i = 0; i < count; i++) angles.push(random() * Math.PI * 2);
  angles.sort((a, b) => a - b);
  const vertices: number[] = [];
  for (const angle of angles) {
    const radius = 20 + random() * 30;
    vertices.push(50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle));
  }
  return vertices;
}

// A random convex polygon: the convex hull of random points, always simple and convex.
function randomConvexPolygon(random: () => number, count: number): number[] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) points.push([10 + random() * 80, 10 + random() * 80]);
  return convexHull(points);
}

// An arbitrary, possibly self-intersecting polygon: random points visited in random order.
function randomMessyPolygon(random: () => number, count: number): number[] {
  const vertices: number[] = [];
  for (let i = 0; i < count; i++) vertices.push(random() * 100, random() * 100);
  return vertices;
}

// Counter-clockwise convex hull (Andrew's monotone chain) of a point set, as a flat vertex list.
function convexHull(points: readonly (readonly [number, number])[]): number[] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: (readonly number[])[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: (readonly number[])[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  const flat: number[] = [];
  for (const p of hull) flat.push(p[0], p[1]);
  return flat;
}

// Total absolute filled area of a path's flattened outline (sum of signed ring areas).
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

// Number of contours in a path's flattened outline.
function ringCount(path: Readonly<Path>): number {
  return flattenPath(path).length;
}

// Whether two areas agree within a combined absolute + relative tolerance.
function areasClose(a: number, b: number, relative = 1e-3, absolute = 1e-3): boolean {
  return Math.abs(a - b) <= absolute + relative * Math.max(Math.abs(a), Math.abs(b));
}

describe('fuzz invariants', () => {
  it('union is commutative: A ∪ B has the same area and ring count as B ∪ A', () => {
    const random = makeRandom(0x1234abcd);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomSimplePolygon(random, 3 + (iteration % 6)));
      const b = polygonPath(randomSimplePolygon(random, 3 + ((iteration + 3) % 6)));
      const ab = unionPaths(a, b);
      const ba = unionPaths(b, a);
      expect(areasClose(pathArea(ab), pathArea(ba))).toBe(true);
      expect(ringCount(ab)).toBe(ringCount(ba));
    }
  });

  it('self-difference is empty: A ∖ A == ∅', () => {
    const random = makeRandom(0x55aa33cc);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 5)));
      const result = differencePaths(a, a);
      expect(pathArea(result)).toBeCloseTo(0, 6);
    }
  });

  it('self-union equals simplify: A ∪ A == simplifyPath(A)', () => {
    const random = makeRandom(0x0f0f0f0f);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomSimplePolygon(random, 3 + (iteration % 6)));
      const union = unionPaths(a, a);
      const simplified = simplifyPath(a);
      expect(areasClose(pathArea(union), pathArea(simplified))).toBe(true);
      expect(ringCount(union)).toBe(ringCount(simplified));
    }
  });

  it('simplify is idempotent: simplify(simplify(A)) == simplify(A)', () => {
    const random = makeRandom(0x7e577e57);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 6)));
      const once = simplifyPath(a);
      const twice = simplifyPath(once);
      expect(areasClose(pathArea(once), pathArea(twice))).toBe(true);
      expect(ringCount(once)).toBe(ringCount(twice));
    }
  });

  it('unionAllPaths of one path equals its simplification', () => {
    const random = makeRandom(0x13571357);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomMessyPolygon(random, 4 + (iteration % 6)));
      const union = unionAllPaths([a]);
      const simplified = simplifyPath(a);
      expect(areasClose(pathArea(union), pathArea(simplified))).toBe(true);
      expect(ringCount(union)).toBe(ringCount(simplified));
    }
  });

  it('offset identity: offsetPath(A, 0) ≈ A', () => {
    const random = makeRandom(0x2468ace0);
    for (let iteration = 0; iteration < 40; iteration++) {
      const vertices = randomSimplePolygon(random, 3 + (iteration % 6));
      const a = polygonPath(vertices);
      const zeroOffset = offsetPath(a, 0);
      expect(areasClose(pathArea(zeroOffset), pathArea(a), 1e-2, 1e-2)).toBe(true);
      expect(ringCount(zeroOffset)).toBe(1);
    }
  });

  it('double-offset stability: offset +d then −d recovers a convex A within tolerance', () => {
    const random = makeRandom(0x0badf00d);
    for (let iteration = 0; iteration < 40; iteration++) {
      const vertices = randomConvexPolygon(random, 5 + (iteration % 8));
      if (vertices.length < 8) continue; // need at least a quad after hull dedup
      const a = polygonPath(vertices);
      const baseArea = pathArea(a);
      if (baseArea < 50) continue; // skip near-degenerate hulls where the erosion tolerance dominates
      // For a convex polygon, inflating by d then deflating by d with a miter join recovers the polygon:
      // the corner miters added on the grow are exactly removed on the shrink. A high miter limit keeps
      // sharp corners from falling back to a bevel (which would not fully recover).
      const grown = offsetPath(a, 3, { join: 'miter', miterLimit: 100 });
      const recovered = offsetPath(grown, -3, { join: 'miter', miterLimit: 100 });
      expect(ringCount(recovered)).toBe(1);
      expect(areasClose(pathArea(recovered), baseArea, 3e-2, 1)).toBe(true);
    }
  });

  it('concave-offset validity: an offset outline has no self-intersections (equals its own simplify)', () => {
    const random = makeRandom(0x0c0ffee0);
    for (let iteration = 0; iteration < 40; iteration++) {
      const a = polygonPath(randomSimplePolygon(random, 5 + (iteration % 8)));
      const offset = offsetPath(a, 4);
      if (offset.commands.length === 0) continue;
      // A self-intersection-free outline is unchanged by a non-zero simplify: its area and ring count hold.
      const simplified = simplifyPath(offset, { fillRule: 'nonZero' });
      expect(areasClose(pathArea(simplified), pathArea(offset), 1e-2, 1e-2)).toBe(true);
      expect(ringCount(simplified)).toBe(ringCount(offset));
    }
  });
});
