import type { CollisionManifold3D, CollisionShape3D, CollisionTestGuard3D } from '@flighthq/types/contract';

import { getCollisionPairTest3D } from './collisionSupport3D';
import { testCollisionSupport3D } from './gjk3D';
import { clearCollisionManifold3D } from './manifold3D';

// Installs the optional diagnostics seam consulted before testCollision3D dispatches its shape pair.
export function setCollisionTestGuard3D(guard: CollisionTestGuard3D | null): void {
  collisionTestGuard = guard;
}

// The generic 3D narrow-phase entry point. Returns whether the two colliders overlap, writing the
// A-out-of-B manifold into `out` when they do and clearing it when they do not.
//
// Dispatch order is the registry model of `agents/collision-support-registry.md`: a specialization
// registered for this ORDERED kind pair wins; failing that, the reversed pair with the normal negated;
// failing that, the generic GJK/EPA floor. A pair specialization is worth registering when it is faster
// or better-conditioned than the floor — a sphere-sphere test is three operations closed-form and an
// iterative solve through GJK.
//
// Returns false, with `out` cleared, when either kind has no registered support and no specialization
// covers the pair. That silent false is the package's standing sentinel for an unusable shape, and it
// is what `explainCollisionTest3D` classifies and the collision guard warns about — a missed collision
// is the worst available failure, so the diagnostic path exists precisely for it.
export function testCollision3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionManifold3D,
): boolean {
  if (collisionTestGuard !== null) collisionTestGuard(a, b);

  const direct = getCollisionPairTest3D(a.kind, b.kind);
  if (direct !== null) return direct(a, b, out);

  const reversed = getCollisionPairTest3D(b.kind, a.kind);
  if (reversed !== null) {
    // The specialization answers B-out-of-A, so the normal is negated back into this call's sense.
    // Depth is a distance and carries no orientation, so it is left alone.
    if (!reversed(b, a, out)) {
      clearCollisionManifold3D(out);
      return false;
    }
    out.normalX = -out.normalX;
    out.normalY = -out.normalY;
    out.normalZ = -out.normalZ;
    return true;
  }

  return testCollisionSupport3D(a, b, out);
}

let collisionTestGuard: CollisionTestGuard3D | null = null;
