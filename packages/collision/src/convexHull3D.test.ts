import { describe, expect, it } from 'vitest';

import { writeCollisionConvexHullFaces3D } from './convexHull3D';

const faces: number[] = [];

const CUBE = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
const TETRAHEDRON = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

// The signed volume of the closed surface, by the divergence theorem: one sixth of the sum of each
// triangle's scalar triple product about the origin. This is the single strongest check available —
// it is positive only if EVERY triangle is wound outward, and equals the true volume only if the
// surface is closed and non-overlapping. A hull with one inverted face, one missing face, or one
// duplicate comes out wrong.
function signedVolume(points: readonly number[], indices: readonly number[], count: number): number {
  let total = 0;
  for (let f = 0; f < count; f += 1) {
    const a = indices[f * 3];
    const b = indices[f * 3 + 1];
    const c = indices[f * 3 + 2];
    const ax = points[a * 3];
    const ay = points[a * 3 + 1];
    const az = points[a * 3 + 2];
    const bx = points[b * 3];
    const by = points[b * 3 + 1];
    const bz = points[b * 3 + 2];
    const cx = points[c * 3];
    const cy = points[c * 3 + 1];
    const cz = points[c * 3 + 2];
    total += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return total / 6;
}

// Every edge of a closed orientable surface must appear exactly twice, once in each direction. This
// catches a hole and a duplicated face, which a volume check can miss when the errors cancel.
function isClosedSurface(indices: readonly number[], count: number): boolean {
  const seen = new Map<string, number>();
  for (let f = 0; f < count; f += 1) {
    const v = [indices[f * 3], indices[f * 3 + 1], indices[f * 3 + 2]];
    for (let e = 0; e < 3; e += 1) {
      const u = v[e];
      const w = v[(e + 1) % 3];
      seen.set(`${u},${w}`, (seen.get(`${u},${w}`) ?? 0) + 1);
    }
  }
  for (const [key, times] of seen) {
    if (times !== 1) return false;
    const [u, w] = key.split(',');
    if ((seen.get(`${w},${u}`) ?? 0) !== 1) return false;
  }
  return true;
}

describe('writeCollisionConvexHullFaces3D', () => {
  it('triangulates a cube into a closed surface of the right volume', () => {
    const count = writeCollisionConvexHullFaces3D(CUBE, faces);
    // Six square faces, two triangles each.
    expect(count).toBe(12);
    expect(signedVolume(CUBE, faces, count)).toBeCloseTo(8, 9);
    expect(isClosedSurface(faces, count)).toBe(true);
  });

  it('triangulates a tetrahedron', () => {
    const count = writeCollisionConvexHullFaces3D(TETRAHEDRON, faces);
    expect(count).toBe(4);
    expect(signedVolume(TETRAHEDRON, faces, count)).toBeCloseTo(1 / 6, 12);
    expect(isClosedSurface(faces, count)).toBe(true);
  });

  it('winds every triangle OUTWARD, not merely consistently', () => {
    // A consistently INWARD hull is closed and has the right volume magnitude. Only the sign separates
    // them, and an inside-out hull makes a raycast report the far side and an inertia tensor go negative.
    const count = writeCollisionConvexHullFaces3D(CUBE, faces);
    expect(signedVolume(CUBE, faces, count)).toBeGreaterThan(0);
  });

  it('ignores points strictly inside the hull', () => {
    const withInterior = [...CUBE, 0, 0, 0, 0.5, 0.25, -0.25];
    const count = writeCollisionConvexHullFaces3D(withInterior, faces);
    expect(count).toBe(12);
    expect(signedVolume(withInterior, faces, count)).toBeCloseTo(8, 9);
  });

  it('produces the same hull however the points were ordered', () => {
    const reversed: number[] = [];
    for (let i = CUBE.length / 3 - 1; i >= 0; i -= 1) reversed.push(CUBE[i * 3], CUBE[i * 3 + 1], CUBE[i * 3 + 2]);
    const forwardCount = writeCollisionConvexHullFaces3D(CUBE, faces);
    const forwardVolume = signedVolume(CUBE, faces, forwardCount);
    const reversedCount = writeCollisionConvexHullFaces3D(reversed, faces);

    expect(reversedCount).toBe(forwardCount);
    expect(signedVolume(reversed, faces, reversedCount)).toBeCloseTo(forwardVolume, 9);
  });

  it('closes a many-point hull without a hole', () => {
    // A geodesic-ish sphere sample: enough points, none interior, to exercise several stitch rounds.
    const points: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      const z = 1 - (2 * i) / 59;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const theta = i * 2.399963;
      points.push(r * Math.cos(theta), r * Math.sin(theta), z);
    }
    const count = writeCollisionConvexHullFaces3D(points, faces);

    expect(count).toBeGreaterThan(0);
    expect(isClosedSurface(faces, count)).toBe(true);
    // A hull inscribed in the unit sphere is a bit under the sphere's 4.18876.
    const volume = signedVolume(points, faces, count);
    expect(volume).toBeGreaterThan(3.5);
    expect(volume).toBeLessThan(4.19);
  });

  it('returns nothing for fewer than four points', () => {
    expect(writeCollisionConvexHullFaces3D([0, 0, 0, 1, 0, 0, 0, 1, 0], faces)).toBe(0);
    expect(faces).toHaveLength(0);
  });

  it('returns nothing for a degenerate set with no volume', () => {
    // Coplanar: four corners of a square. There is no solid to triangulate, and reporting a surface for
    // one would give it a volume it does not have.
    expect(writeCollisionConvexHullFaces3D([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], faces)).toBe(0);
    // Collinear.
    expect(writeCollisionConvexHullFaces3D([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0], faces)).toBe(0);
  });

  it('handles duplicate points without breaking the surface', () => {
    const withDuplicates = [...TETRAHEDRON, 0, 0, 0, 1, 0, 0];
    const count = writeCollisionConvexHullFaces3D(withDuplicates, faces);
    expect(count).toBe(4);
    expect(isClosedSurface(faces, count)).toBe(true);
  });
});
