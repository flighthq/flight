import type { CollisionContactManifold, CollisionShape, CollisionShapeKind } from '@flighthq/types/contract';

import { clearCollisionContactManifold } from './contactManifold';
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

// Generic narrow-phase contact test: the `testCollision` dispatcher's contact-resolving twin.
// Dispatches on the two shapes' `kind`s and writes the full contact manifold pushing **A out of B**.
// Shapes are canonically ordered by kind rank before dispatch, and the normal is negated when the
// arguments arrived reversed, exactly as `testCollision` does. Contact points are world-space and so
// need no such correction — and because the feature ids are assigned against the canonical order,
// the same pair yields the same ids whichever way round it is passed, which keeps a solver's
// warm-start cache stable even if the broadphase reports the pair in a different order next frame.
//
// Area-less kinds (`segment`, `point`) and unknown kinds carry no contact — the pair is reported as
// non-overlapping. The direct per-pair functions remain the hot path.
export function collideContactManifold(
  a: Readonly<CollisionShape>,
  b: Readonly<CollisionShape>,
  out: CollisionContactManifold,
): boolean {
  const rankA = contactShapeKindRank(a.kind);
  const rankB = contactShapeKindRank(b.kind);
  if (rankA < 0 || rankB < 0) {
    clearCollisionContactManifold(out);
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
function contactShapeKindRank(kind: CollisionShapeKind): number {
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
