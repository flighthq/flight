import type { Physics3DJointSolver, Physics3DWorld } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { explainPhysics3DJoints } from './explainPhysics3DJoints';
import { createPhysics3DBallAndSocketJoint, createPhysics3DHingeJoint } from './jointFactories';
import { addPhysics3DJoint, registerPhysics3DJointSolver } from './jointRegistry';
import { Physics3DBallAndSocketJointKind } from './joints';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('explainPhysics3DJoints', () => {
  it('reports nothing for a world with no joints', () => {
    expect(explainPhysics3DJoints(createTestWorld())).toEqual([]);
  });

  it('calls a fully wired joint solvable', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));

    const [explanation] = explainPhysics3DJoints(world);

    expect(explanation.status).toBe('solvable');
    expect(explanation.hasSolver).toBe(true);
    expect(explanation.bodiesResolvable).toBe(true);
    expect(explanation.index).toBe(0);
    expect(explanation.kind).toBe('Hinge');
  });

  it('separates an unregistered kind from a broken one', () => {
    const world = createTestWorld();
    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));

    const [explanation] = explainPhysics3DJoints(world);

    // Not a fault: a scene deserialized ahead of the code that solves it is explicitly supported, and the
    // joint is meant to sit inert until someone registers its solver.
    expect(explanation.status).toBe('unregistered-kind');
    expect(explanation.hasSolver).toBe(false);
  });

  it('reports a joint outliving one of its bodies', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    // Removing a body drops the joints that named it, so this is the state a world reconstructed by a
    // format layer reaches rather than one the lifecycle produces: an endpoint that resolves to nothing.
    joint.bodyB = 99;

    const [explanation] = explainPhysics3DJoints(world);

    expect(explanation.status).toBe('invalid-bodies');
    expect(explanation.hasSolver).toBe(true);
    expect(explanation.bodiesResolvable).toBe(false);
  });

  it('does not fault a one-body kind for its unused first end', () => {
    const world = createTestWorld();
    const oneBody: Physics3DJointSolver = { prepare(): void {}, solve(): void {}, usesBodyA: false };
    registerPhysics3DJointSolver(world, Physics3DBallAndSocketJointKind, oneBody);
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    joint.bodyA = 404;

    const [explanation] = explainPhysics3DJoints(world);

    // The solver never reads bodyA, so a placeholder index there is not a fault. Asking the kind rather
    // than assuming two endpoints is what keeps this honest for a kind the package does not own.
    expect(explanation.status).toBe('solvable');
  });

  it('reports one entry per joint, indexed back into the world list', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));

    const explanations = explainPhysics3DJoints(world);

    expect(explanations.map((entry) => entry.index)).toEqual([0, 1]);
    expect(world.joints[explanations[1].index].kind).toBe(explanations[1].kind);
  });

  it('changes nothing it looks at', () => {
    const world = createTestWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const joint = addPhysics3DJoint(world, createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 }));
    joint.impulse0 = 7;

    explainPhysics3DJoints(world);

    expect(joint.impulse0).toBe(7);
    expect(world.joints.length).toBe(1);
  });
});

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  return world;
}
