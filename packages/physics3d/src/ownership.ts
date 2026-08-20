import type { Physics3DJoint, Physics3DWorld } from '@flighthq/types/contract';

// Ownership is RUNTIME state rather than serialized entity data. Weak keys make membership follow the
// explicit add/remove lifecycle without keeping a detached entity alive, and map directly to an owner
// pointer in the native port. They are what stops one mutable joint — and the impulse cache that rides on
// it — from participating in two solve lists at once, where each world's iterations would overwrite the
// other's accumulators every step.
export const physics3DJointOwners = new WeakMap<Physics3DJoint, Physics3DWorld>();

// A world step is a strict mutation boundary. Contact hooks run inside it and may change only the contact
// fields their contract names: adding or removing a body, contact, or joint while an array is being solved
// can skip a constraint, partially integrate a newly-added body, or invalidate the iterator outright.
export const steppingPhysics3DWorlds = new WeakSet<Physics3DWorld>();

export function assertPhysics3DWorldNotStepping(world: Readonly<Physics3DWorld>): void {
  if (steppingPhysics3DWorlds.has(world as Physics3DWorld)) {
    throw new Error('Cannot mutate a physics world while it is stepping');
  }
}
