import type {
  CollisionContactManifold2D,
  CollisionBuiltInShape2D,
  CollisionShapeKind2D,
} from '@flighthq/types/contract';

import { clearCollisionContactManifold2D } from './contactManifold';
import {
  collideAabbAabbContactManifold,
  collideAabbObbContactManifold,
  collideAabbPolygonContactManifold,
  collideCircleAabbContactManifold,
  collideCircleCircleContactManifold,
  collideCircleObbContactManifold,
  collideCirclePolygonContactManifold,
  collideObbObbContactManifold,
  collideObbPolygonContactManifold,
  collidePolygonPolygonContactManifold,
} from './shapeContact';

// Generic narrow-phase contact test: the `testCollision2D` dispatcher's contact-resolving twin.
// Dispatches on the two shapes' `kind`s and writes the full contact manifold pushing **A out of B**.
// Shapes are ordered by kind rank before dispatch, and the normal is negated when the arguments
// arrived reversed, exactly as `testCollision2D` does. Contact points are world-space and need no such
// correction.
//
// **Argument order.** Overlap, normal, and depth are order-invariant for every pair (the normal
// negates, nothing else moves). Contact points and their feature ids are order-invariant only for
// pairs of DIFFERENT kinds, where the kind rank fixes which shape owns the reference face. For two
// shapes of the SAME kind the caller's order decides: two coincident faces tie exactly on separation
// (a box resting squarely on a box is the common case), the tie resolves toward the first argument,
// and the reference shape is the one whose face the contact points then lie on. Reversing the
// arguments moves the points to the opposite surface — one penetration depth away, both correct —
// and renumbers their ids.
//
// This is a property of the pair, not a defect to fix here. Resolving it would need a tie-break
// derived from the shapes' own coordinates, and any such rule is a pure function of values that flips
// the moment those values cross — reintroducing, at dispatch, the frame-to-frame flapping that the
// reference-face bias exists to prevent. Stability across frames needs memory of the previous frame,
// which a stateless narrow phase does not have and a simulation does. So a caller that keys anything
// on feature identity (a warm-start cache) must pass each pair in a STABLE order of its own — ordering
// by persistent body identity, not by geometry, since only identity survives motion. `@flighthq/
// physics2d` orders every pair by body index before it calls.
//
// Area-less kinds (`segment`, `point`) and unknown kinds carry no contact — the pair is reported as
// non-overlapping. The direct per-pair functions remain the hot path.
export function collideContactManifold2D(
  a: Readonly<CollisionBuiltInShape2D>,
  b: Readonly<CollisionBuiltInShape2D>,
  out: CollisionContactManifold2D,
): boolean {
  const rankA = contactShapeKindRank(a.kind);
  const rankB = contactShapeKindRank(b.kind);
  if (rankA < 0 || rankB < 0) {
    clearCollisionContactManifold2D(out);
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
          overlapping = collideCircleCircleContactManifold(lo, hi, out);
          break;
        case 'aabb':
          overlapping = collideCircleAabbContactManifold(lo, hi, out);
          break;
        case 'obb':
          overlapping = collideCircleObbContactManifold(lo, hi, out);
          break;
        case 'polygon':
          overlapping = collideCirclePolygonContactManifold(lo, hi, out);
          break;
      }
      break;
    case 'aabb':
      switch (hi.kind) {
        case 'aabb':
          overlapping = collideAabbAabbContactManifold(lo, hi, out);
          break;
        case 'obb':
          overlapping = collideAabbObbContactManifold(lo, hi, out);
          break;
        case 'polygon':
          overlapping = collideAabbPolygonContactManifold(lo, hi, out);
          break;
      }
      break;
    case 'obb':
      switch (hi.kind) {
        case 'obb':
          overlapping = collideObbObbContactManifold(lo, hi, out);
          break;
        case 'polygon':
          overlapping = collideObbPolygonContactManifold(lo, hi, out);
          break;
      }
      break;
    case 'polygon':
      if (hi.kind === 'polygon') {
        overlapping = collidePolygonPolygonContactManifold(lo, hi, out);
      }
      break;
  }

  if (overlapping && swapped) {
    out.normalX = -out.normalX;
    out.normalY = -out.normalY;
  }
  return overlapping;
}

// Canonical dispatch rank of a shape kind, or -1 for kinds that carry no contact (segment, point,
// and any custom kind). Ordering the pair by rank collapses the 4x4 kind matrix to its ten lower-
// triangular contact pairs.
function contactShapeKindRank(kind: CollisionShapeKind2D): number {
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
