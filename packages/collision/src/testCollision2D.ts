import type { CollisionManifold2D, CollisionShape2D, CollisionTestGuard2D } from '@flighthq/types/contract';

import { getCollisionPairTest2D } from './collisionSupport2D';
import { testCollisionSupport2D } from './gjk2D';

// Installs the optional diagnostics seam consulted before testCollision2D dispatches its shape pair.
export function setCollisionTestGuard2D(guard: CollisionTestGuard2D | null): void {
  collisionTestGuard = guard;
}

// Generic narrow-phase test: writes the manifold pushing **A out of B** and returns whether the pair
// overlaps. Dispatch is a two-tier registry lookup, in this order:
//
//  1. A PAIR SPECIALIZATION registered for this ordered kind pair, then for the reverse pair with the
//     normal negated. This is where the ten SAT pairs live once `registerBuiltInCollisionPairTests2D`
//     has been called, and where a vendor puts a closed-form or better-conditioned path of its own.
//  2. The GENERIC support-function floor — GJK for overlap, EPA for penetration — which answers any
//     pair whose two kinds both have a registered support function.
//
// Nothing is registered at module load, so a caller that registers neither gets `false` from every
// pair. That is the same sentinel as an unregistered vendor kind and the same one
// `explainCollisionTest2D` classifies, so a silent non-overlap always has one explanation to ask for
// rather than two. The direct per-pair functions remain the allocation-free hot path and need no
// registration at all.
//
// The reverse-key attempt is what keeps the registry to ten entries instead of twenty: a manifold is
// oriented A-out-of-B, so a specialization written for (circle, aabb) answers (aabb, circle) exactly
// mirrored. Negating is only valid on an OVERLAP — a miss leaves the manifold cleared, and negating a
// zero normal would write `-0` into a field a caller may compare against `0`.
export function testCollision2D(
  a: Readonly<CollisionShape2D>,
  b: Readonly<CollisionShape2D>,
  out: CollisionManifold2D,
): boolean {
  if (collisionTestGuard !== null) collisionTestGuard(a, b);

  const forward = getCollisionPairTest2D(a.kind, b.kind);
  if (forward !== null) return forward(a, b, out);

  const reversed = getCollisionPairTest2D(b.kind, a.kind);
  if (reversed !== null) {
    if (!reversed(b, a, out)) return false;
    out.normalX = -out.normalX;
    out.normalY = -out.normalY;
    return true;
  }

  return testCollisionSupport2D(a, b, out);
}

let collisionTestGuard: CollisionTestGuard2D | null = null;
