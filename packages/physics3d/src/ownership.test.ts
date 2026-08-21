import { describe, expect, it } from 'vitest';

import {
  assertPhysics3DBodyNotStepping,
  assertPhysics3DWorldNotStepping,
  physics3DBodyOwners,
  physics3DJointOwners,
  steppingPhysics3DWorlds,
} from './ownership';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('assertPhysics3DBodyNotStepping', () => {
  it('resolves the owning world and refuses mutation during its step', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D();
    addPhysics3DBody(world, body);
    steppingPhysics3DWorlds.add(world);

    expect(() => assertPhysics3DBodyNotStepping(body)).toThrow();

    steppingPhysics3DWorlds.delete(world);
    expect(() => assertPhysics3DBodyNotStepping(body)).not.toThrow();
  });
});

describe('assertPhysics3DWorldNotStepping', () => {
  it('permits a mutation outside the step', () => {
    expect(() => assertPhysics3DWorldNotStepping(createPhysics3DWorld())).not.toThrow();
  });

  it('refuses a mutation while the world is stepping', () => {
    const world = createPhysics3DWorld();
    steppingPhysics3DWorlds.add(world);

    expect(() => assertPhysics3DWorldNotStepping(world)).toThrow();

    steppingPhysics3DWorlds.delete(world);
  });

  it('tracks each world separately', () => {
    const stepping = createPhysics3DWorld();
    const idle = createPhysics3DWorld();
    steppingPhysics3DWorlds.add(stepping);

    expect(() => assertPhysics3DWorldNotStepping(idle)).not.toThrow();

    steppingPhysics3DWorlds.delete(stepping);
  });

  it('keeps joint ownership out of the serializable world record', () => {
    // Ownership is runtime state: a world reconstructed by a format layer carries no owner map, and rebuilding
    // one is the add path's job rather than something the record has to round-trip.
    expect(physics3DJointOwners).toBeInstanceOf(WeakMap);
    expect(Object.keys(createPhysics3DWorld())).not.toContain('jointOwners');
  });

  it('keeps body ownership out of the serializable world record', () => {
    expect(physics3DBodyOwners).toBeInstanceOf(WeakMap);
    expect(Object.keys(createPhysics3DWorld())).not.toContain('bodyOwners');
  });
});
