import { describe, expect, it } from 'vitest';

import { assertPhysics3DWorldNotStepping, physics3DJointOwners, steppingPhysics3DWorlds } from './ownership';
import { createPhysics3DWorld } from './world';

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
});
