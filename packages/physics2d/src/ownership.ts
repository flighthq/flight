import type { Physics2DCollider, Physics2DJoint, Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';

// Ownership is runtime state rather than serialized entity data. Weak keys make membership follow the
// explicit add/remove lifecycle without keeping a detached entity alive, and map directly to an owner
// pointer in the native port. They prevent the same mutable body, collider scratch, or impulse cache
// from participating in two solve lists at once.
export const physics2DBodyOwners = new WeakMap<RigidBody2D, Physics2DWorld>();
export const physics2DColliderOwners = new WeakMap<Physics2DCollider, RigidBody2D>();
export const physics2DJointOwners = new WeakMap<Physics2DJoint, Physics2DWorld>();

// A world step is a strict mutation boundary. Contact hooks run inside it, but may change only the
// contact fields their contract names: changing world topology while an array is being solved can skip
// a constraint, partially integrate a newly-added body, or invalidate the iterator outright. Runtime
// state belongs here beside ownership rather than in the serializable world descriptor.
export const steppingPhysics2DWorlds = new WeakSet<Physics2DWorld>();

export function assertPhysics2DWorldNotStepping(world: Readonly<Physics2DWorld>): void {
  if (steppingPhysics2DWorlds.has(world as Physics2DWorld)) {
    throw new Error('Cannot mutate a physics world while it is stepping');
  }
}
