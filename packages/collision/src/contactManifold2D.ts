import { createEntity } from '@flighthq/entity/contract';
import type { CollisionContactManifold2D, CollisionContactPoint2D } from '@flighthq/types/contract';

// Lifecycle for the contact manifold the `collide*ContactManifold` functions write. The two contact
// points are allocated once, here, and reused for the manifold's whole life — a solver's per-frame
// narrow-phase loop over thousands of pairs allocates nothing.

// Clears a manifold to the non-overlapping state: `overlapping` false, normal, depth, and point
// count zero. The contact-point entries themselves are left untouched — `pointCount` alone bounds
// what is readable, so clearing does not need to walk them and a stale point can never be read
// through the documented contract.
export function clearCollisionContactManifold2D(out: CollisionContactManifold2D): void {
  out.overlapping = false;
  out.normalX = 0;
  out.normalY = 0;
  out.depth = 0;
  out.pointCount = 0;
}

// Allocates a fresh contact manifold in the non-overlapping state, with its fixed two-point array
// already populated, ready to be passed as an `out` parameter.
export function createCollisionContactManifold2D(): CollisionContactManifold2D {
  return createEntity({
    overlapping: false,
    normalX: 0,
    normalY: 0,
    depth: 0,
    pointCount: 0,
    points: [createContactPoint(), createContactPoint()],
  });
}

function createContactPoint(): CollisionContactPoint2D {
  return { x: 0, y: 0, depth: 0, featureId: 0 };
}
