import type { CollisionShapeKind2D, Physics2DCollisionExplanation, Physics2DWorld } from '@flighthq/types/contract';

// Reports the collider kinds in `world` that the 2D contact dispatcher cannot turn into a manifold, and
// which therefore generate no contacts at all.
//
// This exists because the dispatcher's coverage is NARROWER than the collider type allows. Every kind in
// `CollisionBuiltInShape2D` may be authored onto a body, but `collideContactManifold2D` answers only for
// the shapes that enclose an area; `segment` and `point` are area-less by definition and carry no contact
// to find, so a body built from one is reported as touching nothing and falls through the world.
//
// That is a modelling mistake with no fix inside this package, and it is invisible from inside the
// simulation — nothing fails, nothing is slow, the body simply never collides. Which is exactly why the
// question has to be answerable from outside it.
//
// The list stays a general query rather than a hardcoded "segment or point" test, because the answer is a
// property of the dispatcher and not of this file: a kind added to the collider union without pair
// functions would show up here on its own, which is how the capsule surfaced before its were written.
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
  return kind === 'circle' || kind === 'capsule' || kind === 'aabb' || kind === 'obb' || kind === 'polygon';
}
