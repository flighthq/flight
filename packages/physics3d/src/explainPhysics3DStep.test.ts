import type { Physics3DWorld } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics3DContact } from './contacts';
import { explainPhysics3DStep } from './explainPhysics3DStep';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { stepPhysics3D } from './step';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';

describe('explainPhysics3DStep', () => {
  it('reports a ready world', () => {
    const explanation = explainPhysics3DStep(createTestWorld(), 1 / 60);

    expect(explanation.status).toBe('ready');
    expect(explanation.timestepValid).toBe(true);
    expect(explanation.bodyStateValid).toBe(true);
  });

  it('names the timestep as the fault, and only it', () => {
    const explanation = explainPhysics3DStep(createTestWorld(), 0);

    expect(explanation.status).toBe('invalid-step');
    expect(explanation.timestepValid).toBe(false);
    expect(explanation.bodyStateValid).toBe(true);
    expect(explanation.solverConfigValid).toBe(true);
  });

  it('names a body carrying a non-finite field', () => {
    const world = createTestWorld();
    world.bodies[0].angularVelocityZ = Number.NaN;

    const explanation = explainPhysics3DStep(world, 1 / 60);

    expect(explanation.bodyStateValid).toBe(false);
    expect(explanation.status).toBe('invalid-step');
  });

  it('names an invalid collider independently from body state', () => {
    const world = createTestWorld();
    const collider = createPhysics3DCollider({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 });
    addPhysics3DCollider(world, world.bodies[0], collider);
    collider.material.friction = Number.NaN;

    const explanation = explainPhysics3DStep(world, 1 / 60);

    expect(explanation.bodyStateValid).toBe(true);
    expect(explanation.colliderStateValid).toBe(false);
    expect(explanation.status).toBe('invalid-step');
  });

  it('names a body the index map disagrees about', () => {
    const world = createTestWorld();
    world.bodyByIndex.delete(world.bodies[0].index);

    expect(explainPhysics3DStep(world, 1 / 60).bodyStateValid).toBe(false);
  });

  it('names a contact whose point count runs past its points', () => {
    const world = createTestWorld();
    const contact = createPhysics3DContact(0, 1);
    contact.pointCount = 3;
    world.contacts.push(contact);

    expect(explainPhysics3DStep(world, 1 / 60).contactStateValid).toBe(false);
  });

  it('names a joint carrying a non-finite field', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    joint.localAnchorAX = Number.POSITIVE_INFINITY;

    expect(explainPhysics3DStep(world, 1 / 60).jointStateValid).toBe(false);
  });

  it('names gravity, substeps, and each iteration count separately', () => {
    const gravity = createTestWorld();
    gravity.gravityZ = Number.NaN;
    expect(explainPhysics3DStep(gravity, 1 / 60).gravityValid).toBe(false);

    const substeps = createTestWorld();
    substeps.config.substeps = 0;
    expect(explainPhysics3DStep(substeps, 1 / 60).substepsValid).toBe(false);

    const velocity = createTestWorld();
    velocity.config.sequentialImpulse.velocityIterations = -1;
    expect(explainPhysics3DStep(velocity, 1 / 60).velocityIterationsValid).toBe(false);

    const position = createTestWorld();
    position.config.sequentialImpulse.positionIterations = 1.5;
    expect(explainPhysics3DStep(position, 1 / 60).positionIterationsValid).toBe(false);
  });

  it('reports every fault at once rather than stopping at the first', () => {
    const world = createTestWorld();
    world.gravityY = Number.NaN;
    world.config.substeps = -2;

    const explanation = explainPhysics3DStep(world, -1);

    // A world with several faults would otherwise be repaired one frame at a time, each fix revealing the
    // next.
    expect(explanation.timestepValid).toBe(false);
    expect(explanation.gravityValid).toBe(false);
    expect(explanation.substepsValid).toBe(false);
  });

  it('agrees with what the step actually does', () => {
    const world = createTestWorld();
    world.config.sequentialImpulse.positionCorrection = 5;

    // The step declines silently, and this is the seam that makes that silence readable. The two asking
    // the same predicates is what stops them disagreeing about what "steppable" means.
    expect(explainPhysics3DStep(world, 1 / 60).status).toBe('invalid-step');
    stepPhysics3D(world, 1 / 60);
    expect(world.bodies[0].velocityY).toBe(0);
  });

  it('changes nothing it looks at', () => {
    const world = createTestWorld();
    world.bodies[0].velocityX = 3;

    explainPhysics3DStep(world, 1 / 60);
    stepPhysics3D(world, 1 / 60);

    expect(world.bodies[0].velocityX).toBe(3);
    expect(world.previousTimestep).toBeCloseTo(1 / 60, 12);
  });
});

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  return world;
}
