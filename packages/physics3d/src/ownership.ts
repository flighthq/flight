import type { Physics3DCollider, Physics3DJoint, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';

// Ownership is RUNTIME state rather than serialized entity data. Weak keys make membership follow the
// explicit add/remove lifecycle without keeping a detached entity alive, and map directly to an owner
// pointer in the native port. They are what stops one mutable body or joint — and the contact or joint
// impulse cache that rides on it — from participating in two solve lists at once, where each world's
// iterations would overwrite the other's state every step.
export const physics3DBodyOwners = new WeakMap<RigidBody3D, Physics3DWorld>();
export const physics3DJointOwners = new WeakMap<Physics3DJoint, Physics3DWorld>();

// The same rule one level down. A collider carries the world-space shape its body's pose is written
// into, so sharing one between two bodies would have each step's transform overwrite the other's — and
// the narrow phase would then test both bodies against whichever pose happened to be written last.
export const physics3DColliderOwners = new WeakMap<Physics3DCollider, RigidBody3D>();

// A world step is a strict mutation boundary. Contact hooks run inside it and may change only the contact
// fields their contract names: adding or removing a body, contact, or joint while an array is being solved
// can skip a constraint, partially integrate a newly-added body, or invalidate the iterator outright.
export const steppingPhysics3DWorlds = new WeakSet<Physics3DWorld>();

export function assertPhysics3DBodyNotStepping(body: Readonly<RigidBody3D>): void {
  const world = physics3DBodyOwners.get(body as RigidBody3D);
  if (world !== undefined) assertPhysics3DWorldNotStepping(world);
}

export function assertPhysics3DWorldNotStepping(world: Readonly<Physics3DWorld>): void {
  if (steppingPhysics3DWorlds.has(world as Physics3DWorld)) {
    throw new Error('Cannot mutate a physics world while it is stepping');
  }
}
