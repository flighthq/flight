import type { Physics3DJointSolver, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics3DBallAndSocketJoint, createPhysics3DHingeJoint } from './jointFactories';
import {
  addPhysics3DJoint,
  getPhysics3DJointSolver,
  invalidatePhysics3DJoint,
  isPhysics3DPairOrdered,
  registerPhysics3DJointSolver,
  removePhysics3DJoint,
} from './jointRegistry';
import { physics3DBallAndSocketJointSolver, physics3DHingeJointSolver, Physics3DHingeJointKind } from './joints';
import { steppingPhysics3DWorlds } from './ownership';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('addPhysics3DJoint', () => {
  it('returns the joint it was given and records it on the world', () => {
    const world = createTestWorld();
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });

    expect(addPhysics3DJoint(world, joint)).toBe(joint);
    expect(world.joints).toEqual([joint]);
  });

  it('refuses a joint that already belongs to a world', () => {
    const world = createTestWorld();
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });
    addPhysics3DJoint(world, joint);

    expect(() => addPhysics3DJoint(world, joint)).toThrow();
    expect(() => addPhysics3DJoint(createTestWorld(), joint)).toThrow();
  });

  it('exchanges out-of-order ends when the kind has a solver to consult', () => {
    const world = createTestWorld();
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
    const joint = createPhysics3DHingeJoint({
      bodyA: 1,
      bodyB: 0,
      localAnchorAX: 5,
      localAnchorBX: 7,
      lowerAngle: -0.25,
      upperAngle: 1.5,
    });

    addPhysics3DJoint(world, joint);

    expect(joint.bodyA).toBe(0);
    expect(joint.bodyB).toBe(1);
    expect(joint.localAnchorAX).toBe(7);
    expect(joint.localAnchorBX).toBe(5);
    expect(joint.lowerAngle).toBe(-1.5);
  });

  it('leaves an unknown kind in its authored order', () => {
    const world = createTestWorld();
    const joint = createPhysics3DHingeJoint({ bodyA: 1, bodyB: 0, lowerAngle: -0.25, upperAngle: 1.5 });

    addPhysics3DJoint(world, joint);

    // Exchanging the ends without the kind's consent would move the bodies and anchors while the limit
    // interval stayed as authored — the generic half of a swap with the kind's half missing, which no later
    // registration repairs.
    expect(joint.bodyA).toBe(1);
    expect(joint.lowerAngle).toBe(-0.25);
  });

  it('wakes both bodies when the constraint is live', () => {
    const world = createTestWorld();
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
    world.bodies[0].sleeping = true;
    world.bodies[1].sleeping = true;

    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));

    expect(world.bodies[0].sleeping).toBe(false);
    expect(world.bodies[1].sleeping).toBe(false);
  });

  it('leaves a sleeping pair asleep for a kind that constrains nothing yet', () => {
    const world = createTestWorld();
    world.bodies[0].sleeping = true;

    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));

    expect(world.bodies[0].sleeping).toBe(true);
  });

  it('rejects a mutation while the world is stepping', () => {
    const world = createTestWorld();
    steppingPhysics3DWorlds.add(world);

    expect(() => addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }))).toThrow();

    steppingPhysics3DWorlds.delete(world);
  });
});

describe('getPhysics3DJointSolver', () => {
  it('returns null for a kind nobody registered', () => {
    expect(getPhysics3DJointSolver(createTestWorld(), 'acme.Suspension')).toBeNull();
  });

  it('returns the registered solver', () => {
    const world = createTestWorld();
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);

    expect(getPhysics3DJointSolver(world, Physics3DHingeJointKind)).toBe(physics3DHingeJointSolver);
  });
});

describe('invalidatePhysics3DJoint', () => {
  it('clears every common accumulator and the kind-specific ones', () => {
    const world = createTestWorld();
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
    const joint = addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    joint.impulse0 = 1;
    joint.impulse5 = 2;
    (joint as ReturnType<typeof createPhysics3DHingeJoint>).motorImpulse = 3;

    expect(invalidatePhysics3DJoint(world, joint)).toBe(true);
    expect(joint.impulse0).toBe(0);
    expect(joint.impulse5).toBe(0);
    expect((joint as ReturnType<typeof createPhysics3DHingeJoint>).motorImpulse).toBe(0);
  });

  it('returns false for a joint this world does not hold', () => {
    const world = createTestWorld();
    const joint = createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 });

    expect(invalidatePhysics3DJoint(world, joint)).toBe(false);
  });
});

describe('isPhysics3DPairOrdered', () => {
  it('orders by persistent index and admits a pair already in order', () => {
    expect(isPhysics3DPairOrdered(0, 1)).toBe(true);
    expect(isPhysics3DPairOrdered(1, 1)).toBe(true);
    expect(isPhysics3DPairOrdered(1, 0)).toBe(false);
  });
});

describe('registerPhysics3DJointSolver', () => {
  it('canonicalizes joints that were added before their solver existed', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(
      world,
      createPhysics3DHingeJoint({ bodyA: 1, bodyB: 0, lowerAngle: -0.25, upperAngle: 1.5 }),
    );

    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);

    // The outcome no longer depends on whether the scene or the solver arrived first.
    expect(joint.bodyA).toBe(0);
    expect(joint.lowerAngle).toBe(-1.5);
    expect(joint.upperAngle).toBe(0.25);
  });

  it('lets a later registration replace an earlier one', () => {
    const world = createTestWorld();
    const replacement: Physics3DJointSolver = { prepare(): void {}, solve(): void {} };
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, replacement);

    expect(getPhysics3DJointSolver(world, Physics3DHingeJointKind)).toBe(replacement);
  });

  it('wakes the bodies of a joint the registration just brought to life', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    world.bodies[0].sleeping = true;
    world.bodies[1].sleeping = true;

    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);

    expect(world.bodies[0].sleeping).toBe(false);
    expect(world.bodies[1].sleeping).toBe(false);
  });
});

describe('removePhysics3DJoint', () => {
  it('drops the joint and reports it', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    expect(removePhysics3DJoint(world, joint)).toBe(true);
    expect(world.joints).toEqual([]);
  });

  it('returns false for a joint it never held', () => {
    const world = createTestWorld();

    expect(removePhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }))).toBe(false);
  });

  it('releases ownership so the joint can be added again', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    removePhysics3DJoint(world, joint);

    expect(() => addPhysics3DJoint(world, joint)).not.toThrow();
  });

  it('wakes both bodies when a live constraint is taken away', () => {
    const world = createTestWorld();
    registerPhysics3DJointSolver(world, Physics3DHingeJointKind, physics3DHingeJointSolver);
    const joint = addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    world.bodies[0].sleeping = true;

    removePhysics3DJoint(world, joint);

    expect(world.bodies[0].sleeping).toBe(false);
  });
});

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  addPhysics3DBody(world, createBody());
  addPhysics3DBody(world, createBody());
  // The ball-and-socket solver is imported so this file exercises a kind with no `swapEnds` of its own; the
  // registry has to reach the generic swap for it without consulting one.
  expect(physics3DBallAndSocketJointSolver.swapEnds).toBeUndefined();
  return world;
}

function createBody(): RigidBody3D {
  return createRigidBody3D('dynamic');
}
