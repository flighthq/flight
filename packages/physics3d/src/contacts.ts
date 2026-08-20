import type { Physics3DContact, Physics3DContactPoint } from '@flighthq/types/contract';

// Constructors for the contact records the step consumes.
//
// This package does not PRODUCE contacts and cannot: the 3D narrow phase and broadphase do not exist yet,
// so a caller supplies them directly. That makes these constructors part of the ordinary API rather than a
// test convenience — they are how a caller builds the input the solver is defined against, and they are
// what stops every callsite from hand-writing a literal that happens to match the fields.
//
// A contact allocated here is inert until a caller fills in the geometry: no points, a zero normal, and
// `touching` false. The solver skips exactly that shape, so a half-built contact costs nothing and moves
// nothing.

// Allocates one contact between two bodies, in canonical order.
//
// The order is an invariant of creation rather than a convention a caller is asked to respect, so it is
// enforced here: a narrow phase resolves contact points on the reference shape's surface and ties toward
// its first argument, which means passing the same pair the other way round moves the points and renumbers
// their feature ids — and the warm-start cache is keyed to those ids.
//
// The normal is NOT reordered with the bodies, because there is nothing yet to reorder: a fresh contact
// carries a zero normal, and the caller writing the geometry is the one who knows which way it points. It
// must point so that resolving pushes A out of B.
export function createPhysics3DContact(bodyA: number, bodyB: number): Physics3DContact {
  return {
    bodyA: Math.min(bodyA, bodyB),
    bodyB: Math.max(bodyA, bodyB),
    normalX: 0,
    normalY: 0,
    normalZ: 0,
    pointCount: 0,
    points: [],
    friction: 0,
    restitution: 0,
    enabled: true,
    sensor: false,
    touching: false,
  };
}

// Allocates one contact point, zeroed. `featureId` is the caller's to assign and is opaque to this
// package: its only contract is that the SAME physical feature carries the SAME id between steps, which is
// what lets the solver match this step's points against last step's accumulators.
export function createPhysics3DContactPoint(): Physics3DContactPoint {
  return {
    x: 0,
    y: 0,
    z: 0,
    depth: 0,
    featureId: 0,
    rAX: 0,
    rAY: 0,
    rAZ: 0,
    rBX: 0,
    rBY: 0,
    rBZ: 0,
  };
}
