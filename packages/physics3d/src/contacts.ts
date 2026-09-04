import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Physics3DContact, Physics3DContactPoint, EntityConstruction } from '@flighthq/types/contract';

// Constructors for the contact records the step consumes.
//
// The step GENERATES contacts from a body's colliders, so these are not the ordinary path. They are the
// escape hatch: the solver is defined against contact records rather than against a detector, so a caller
// driving it from its own detection — a replayed trace, a fixture, a narrow phase this package does not
// own — builds the input here rather than hand-writing a literal that happens to match the fields.
//
// A contact allocated here is inert until a caller fills in the geometry: no points, a zero normal, and
// `touching` false. The solver skips exactly that shape, so a half-built contact costs nothing and moves
// nothing. Note that a contact the step does not re-find is retired at the end of the next step, because
// contact lifetime is owned by intake — a hand-built contact survives only as long as the geometry that
// justifies it does.

export function createPhysics3DContact(bodyA: number, bodyB: number, colliderA = 0, colliderB = 0): Physics3DContact {
  const out = allocateEntity<Physics3DContact>();
  initializePhysics3DContact(out, bodyA, bodyB, colliderA, colliderB);
  return finishEntity(out);
}

export function createPhysics3DContactPoint(): Physics3DContactPoint {
  const out = allocateEntity<Physics3DContactPoint>();
  initializePhysics3DContactPoint(out);
  return finishEntity(out);
}

// Allocates one contact between two bodies, in canonical order.
//
// The order is an invariant of creation rather than a convention a caller is asked to respect, so it is
// enforced here: a narrow phase resolves contact points on the reference shape's surface and ties toward
// its first argument, which means passing the same pair the other way round moves the points and renumbers
// their feature ids — and the warm-start cache is keyed to those ids.
//
// The COLLIDER indices swap with the bodies, because they name a position in each body's own collider
// list: leaving them behind would attach body A's contact to body B's geometry. They default to zero,
// which is the right answer for the single-collider bodies a hand-built contact almost always names.
//
// The normal is NOT reordered with the bodies, because there is nothing yet to reorder: a fresh contact
// carries a zero normal, and the caller writing the geometry is the one who knows which way it points. It
// must point so that resolving pushes A out of B.
export function initializePhysics3DContact(
  out: EntityConstruction<Physics3DContact>,
  bodyA: number,
  bodyB: number,
  colliderA = 0,
  colliderB = 0,
): void {
  const ordered = bodyA <= bodyB;
  out.bodyA = ordered ? bodyA : bodyB;
  out.bodyB = ordered ? bodyB : bodyA;
  out.colliderA = ordered ? colliderA : colliderB;
  out.colliderB = ordered ? colliderB : colliderA;
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
  out.pointCount = 0;
  out.points = [];
  out.friction = 0;
  out.restitution = 0;
  out.enabled = true;
  out.sensor = false;
  out.touching = false;
}

// Allocates one contact point, zeroed. `featureId` is the caller's to assign and is opaque to this
// package: its only contract is that the SAME physical feature carries the SAME id between steps, which is
// what lets the solver match this step's points against last step's accumulators.
export function initializePhysics3DContactPoint(out: EntityConstruction<Physics3DContactPoint>): void {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.depth = 0;
  out.featureId = 0;
  out.rAX = 0;
  out.rAY = 0;
  out.rAZ = 0;
  out.rBX = 0;
  out.rBY = 0;
  out.rBZ = 0;
}
