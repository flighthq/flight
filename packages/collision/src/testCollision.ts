import type { CollisionManifold, CollisionShape, CollisionShapeKind } from '@flighthq/types';

import { clearCollisionManifold } from './manifold';
import {
  testAabbAabbCollision,
  testAabbObbCollision,
  testAabbPolygonCollision,
  testCircleAabbCollision,
  testCircleCircleCollision,
  testCircleObbCollision,
  testCirclePolygonCollision,
  testObbObbCollision,
  testObbPolygonCollision,
  testPolygonPolygonCollision,
} from './shapeCollision';

// Generic narrow-phase test: dispatches on the two shapes' `kind`s to the matching per-pair test and
// writes the manifold pushing **A out of B**. Shapes are canonically ordered by kind rank before
// dispatch so only the ten manifold-bearing pairs (circle/aabb/obb/polygon) need explicit branches;
// when the arguments arrive in the reversed order the shared normal is negated to preserve the
// A-out-of-B orientation. Area-less kinds (`segment`, `point`) and unknown kinds carry no manifold —
// the pair is reported as non-overlapping; use `getCollisionShapeContainsPoint` or the
// `testSegment*Collision` queries for those. The direct per-pair functions remain the hot path.
export function testCollision(
  a: Readonly<CollisionShape>,
  b: Readonly<CollisionShape>,
  out: CollisionManifold,
): boolean {
  const rankA = shapeKindRank(a.kind);
  const rankB = shapeKindRank(b.kind);
  if (rankA < 0 || rankB < 0) {
    clearCollisionManifold(out);
    return false;
  }

  const swapped = rankA > rankB;
  const lo = swapped ? b : a;
  const hi = swapped ? a : b;

  let overlapping = false;
  switch (lo.kind) {
    case 'circle':
      switch (hi.kind) {
        case 'circle':
          overlapping = testCircleCircleCollision(lo, hi, out);
          break;
        case 'aabb':
          overlapping = testCircleAabbCollision(lo, hi, out);
          break;
        case 'obb':
          overlapping = testCircleObbCollision(lo, hi, out);
          break;
        case 'polygon':
          overlapping = testCirclePolygonCollision(lo, hi, out);
          break;
      }
      break;
    case 'aabb':
      switch (hi.kind) {
        case 'aabb':
          overlapping = testAabbAabbCollision(lo, hi, out);
          break;
        case 'obb':
          overlapping = testAabbObbCollision(lo, hi, out);
          break;
        case 'polygon':
          overlapping = testAabbPolygonCollision(lo, hi, out);
          break;
      }
      break;
    case 'obb':
      switch (hi.kind) {
        case 'obb':
          overlapping = testObbObbCollision(lo, hi, out);
          break;
        case 'polygon':
          overlapping = testObbPolygonCollision(lo, hi, out);
          break;
      }
      break;
    case 'polygon':
      if (hi.kind === 'polygon') {
        overlapping = testPolygonPolygonCollision(lo, hi, out);
      }
      break;
  }

  if (overlapping && swapped) {
    out.normalX = -out.normalX;
    out.normalY = -out.normalY;
  }
  return overlapping;
}

// Canonical dispatch rank of a shape kind, or -1 for kinds that carry no manifold (segment, point,
// and any custom kind). Ordering the pair by rank collapses the 4x4 kind matrix to its ten lower-
// triangular manifold pairs.
function shapeKindRank(kind: CollisionShapeKind): number {
  switch (kind) {
    case 'circle':
      return 0;
    case 'aabb':
      return 1;
    case 'obb':
      return 2;
    case 'polygon':
      return 3;
    default:
      return -1;
  }
}
