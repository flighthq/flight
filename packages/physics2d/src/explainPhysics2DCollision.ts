import type { CollisionShapeKind2D, Physics2DCollisionExplanation, Physics2DWorld } from '@flighthq/types/contract';

// Reports the collider kinds in `world` that the 2D contact dispatcher cannot turn into a manifold, and
// which therefore generate no contacts at all.
//
// This exists because the dispatcher's coverage is NARROWER than the collider type allows. Every kind in
// `CollisionBuiltInShape2D` may be authored onto a body, but `collideContactManifold2D` answers only for
// the area shapes it has pair functions for; anything else is reported as non-overlapping. That is the
// right behaviour for `segment` and `point`, which are area-less by definition and carry no contact to
// find — and it is a GAP for `capsule`, whose pair functions are not written yet.
//
// The distinction matters to a caller and is deliberately not made here: this reports what does not
// collide, not why. A segment collider on a body is a modelling mistake; a capsule one is a missing
// feature. Both look identical from inside the simulation, which is exactly why the question needs
// answering from outside it.
export function explainPhysics2DCollision(world: Readonly<Physics2DWorld>): Physics2DCollisionExplanation {
  const unsupported = new Set<string>();
  for (const body of world.bodies) {
    for (const collider of body.colliders) {
      if (isPhysics2DContactSupportedKind(collider.world.kind)) continue;
      unsupported.add(collider.world.kind);
    }
  }
  const unsupportedKinds = [...unsupported].sort();
  return {
    status: unsupportedKinds.length === 0 ? 'ready' : 'missing-contact-support',
    unsupportedKinds,
  };
}

// Mirrors `collideContactManifold2D`'s own rank table. Kept as a separate list rather than reached
// through the dispatcher because asking the dispatcher would mean synthesizing a shape of each kind to
// test with, and a diagnostic must not be able to change what it measures.
function isPhysics2DContactSupportedKind(kind: CollisionShapeKind2D): boolean {
  return kind === 'circle' || kind === 'aabb' || kind === 'obb' || kind === 'polygon';
}
