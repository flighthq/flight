import type { Physics3DWorld } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  isPhysics3DPairJointSuppressed,
  rebuildPhysics3DJointCollisionSuppressions,
} from './jointCollisionSuppression';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint, registerPhysics3DJointSolver, removePhysics3DJoint } from './jointRegistry';
import { physics3DBallAndSocketJointSolver, Physics3DBallAndSocketJointKind } from './joints';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('isPhysics3DPairJointSuppressed', () => {
  it('reports a pair held by a joint that does not collide', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(true);
  });

  it('answers the same whichever way round the pair is given', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    expect(isPhysics3DPairJointSuppressed(world, 1, 0)).toBe(true);
  });

  it('leaves a pair alone when the joint opts into colliding', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1, collideConnected: true }));

    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(false);
  });

  it('leaves a pair alone while the joint kind has no solver', () => {
    const world = createPhysics3DWorld();
    addPhysics3DBody(world, createRigidBody3D('dynamic'));
    addPhysics3DBody(world, createRigidBody3D('dynamic'));
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    // An unregistered joint holds nothing together, so hiding the pair's contact would hide a real collision.
    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(false);
  });

  it('reports false for an unrelated pair', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    expect(isPhysics3DPairJointSuppressed(world, 0, 2)).toBe(false);
  });

  it('keeps a pair suppressed while a second joint still holds it', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    const second = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    removePhysics3DJoint(world, second);

    // The index counts rather than flags, so removing one of two suppressing joints cannot re-enable the pair.
    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(true);
  });
});

describe('rebuildPhysics3DJointCollisionSuppressions', () => {
  it('picks up an endpoint edited in place', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    joint.bodyB = 2;

    rebuildPhysics3DJointCollisionSuppressions(world);

    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(false);
    expect(isPhysics3DPairJointSuppressed(world, 0, 2)).toBe(true);
  });

  it('drops every suppression when the joint list empties', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    world.joints.splice(world.joints.indexOf(joint), 1);

    rebuildPhysics3DJointCollisionSuppressions(world);

    expect(isPhysics3DPairJointSuppressed(world, 0, 1)).toBe(false);
  });
});

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  registerPhysics3DJointSolver(world, Physics3DBallAndSocketJointKind, physics3DBallAndSocketJointSolver);
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  return world;
}
