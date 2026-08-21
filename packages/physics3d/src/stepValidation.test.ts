import type { Physics3DWorld } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics3DContact, createPhysics3DContactPoint } from './contacts';
import { createPhysics3DBallAndSocketJoint, createPhysics3DDistanceJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import {
  isPhysics3DBodyStateValid,
  isPhysics3DContactStateValid,
  isPhysics3DContactValid,
  isPhysics3DGravityValid,
  isPhysics3DJointStateValid,
  isPhysics3DPositionIterationsValid,
  isPhysics3DSolverConfigValid,
  isPhysics3DSubstepsValid,
  isPhysics3DTimestepValid,
  isPhysics3DVelocityIterationsValid,
} from './stepValidation';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D } from './world';

describe('isPhysics3DBodyStateValid', () => {
  it('accepts a freshly built world', () => {
    expect(isPhysics3DBodyStateValid(createTestWorld())).toBe(true);
  });

  it('rejects a non-finite pose, velocity, or accumulator', () => {
    for (const key of ['z', 'orientationW', 'angularVelocityY', 'torqueZ', 'centerX'] as const) {
      const world = createTestWorld();
      world.bodies[0][key] = Number.NaN;
      expect(isPhysics3DBodyStateValid(world)).toBe(false);
    }
  });

  it('rejects a non-finite WORLD inertia tensor', () => {
    const world = createTestWorld();
    world.bodies[0].inverseInertiaWorldXY = Number.POSITIVE_INFINITY;

    // Derived, and included anyway: it is what every constraint row multiplies by, so a NaN there reaches
    // both bodies of every contact and joint within one sub-interval.
    expect(isPhysics3DBodyStateValid(world)).toBe(false);
  });

  it('rejects a body the index map has lost track of', () => {
    const world = createTestWorld();
    world.bodyByIndex.delete(world.bodies[0].index);

    expect(isPhysics3DBodyStateValid(world)).toBe(false);
  });

  it('rejects an unknown body type and a negative mass', () => {
    const type = createTestWorld();
    (type.bodies[0] as { type: string }).type = 'ghost';
    expect(isPhysics3DBodyStateValid(type)).toBe(false);

    const mass = createTestWorld();
    mass.bodies[0].mass = -1;
    expect(isPhysics3DBodyStateValid(mass)).toBe(false);
  });
});

describe('isPhysics3DContactStateValid', () => {
  it('accepts a world with no contacts', () => {
    expect(isPhysics3DContactStateValid(createTestWorld())).toBe(true);
  });

  it('rejects the world when any one contact is unusable', () => {
    const world = createTestWorld();
    world.contacts.push(createPhysics3DContact(0, 1));
    world.contacts.push(createPhysics3DContact(0, 1));
    world.contacts[1].friction = Number.NaN;

    expect(isPhysics3DContactStateValid(world)).toBe(false);
  });
});

describe('isPhysics3DContactValid', () => {
  it('accepts a freshly allocated contact', () => {
    expect(isPhysics3DContactValid(createPhysics3DContact(0, 1))).toBe(true);
  });

  it('rejects a point count that runs past the points it has', () => {
    const contact = createPhysics3DContact(0, 1);
    contact.pointCount = 2;

    expect(isPhysics3DContactValid(contact)).toBe(false);
  });

  it('rejects invalid collider indices before the solver indexes a body', () => {
    const contact = createPhysics3DContact(0, 1);
    contact.colliderA = -1;
    expect(isPhysics3DContactValid(contact)).toBe(false);

    contact.colliderA = 0;
    contact.colliderB = 1.5;
    expect(isPhysics3DContactValid(contact)).toBe(false);
  });

  it('rejects a negative friction or restitution', () => {
    const friction = createPhysics3DContact(0, 1);
    friction.friction = -0.1;
    expect(isPhysics3DContactValid(friction)).toBe(false);

    const restitution = createPhysics3DContact(0, 1);
    restitution.restitution = -1;
    expect(isPhysics3DContactValid(restitution)).toBe(false);
  });

  it('rejects a non-finite field on a point it will actually read', () => {
    const contact = createPhysics3DContact(0, 1);
    const point = createPhysics3DContactPoint();
    point.rBZ = Number.NaN;
    contact.points.push(point);
    contact.pointCount = 1;

    expect(isPhysics3DContactValid(contact)).toBe(false);
  });

  it('ignores a point beyond the count, which the solver never reads', () => {
    const contact = createPhysics3DContact(0, 1);
    const point = createPhysics3DContactPoint();
    point.depth = Number.NaN;
    contact.points.push(point);

    expect(isPhysics3DContactValid(contact)).toBe(true);
  });
});

describe('isPhysics3DGravityValid', () => {
  it('accepts finite gravity on every axis and rejects any non-finite one', () => {
    expect(isPhysics3DGravityValid(createTestWorld())).toBe(true);

    for (const axis of ['gravityX', 'gravityY', 'gravityZ'] as const) {
      const world = createTestWorld();
      world[axis] = Number.NaN;
      expect(isPhysics3DGravityValid(world)).toBe(false);
    }
  });
});

describe('isPhysics3DJointStateValid', () => {
  it('ACCEPTS THE INFINITE DEFAULTS every joint is born with', () => {
    // `breakForce`/`breakTorque` default to infinity (never breaks) and a distance joint's `maxLength` to
    // infinity (no far stop). A blanket finiteness walk rejects all three, which invalidates every
    // ordinary joint and makes the world decline to step — silently, because an invalid step is skipped
    // rather than thrown. The symptom is a motor that will not turn and contacts that never fire, with
    // nothing naming the joint. This is the test that catches it.
    const world = createPhysics3DWorld();
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    addPhysics3DJoint(world, createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, enableLimit: true }));

    expect(isPhysics3DJointStateValid(world)).toBe(true);
  });

  it('still rejects a non-finite field that is NOT a declared bound', () => {
    const world = createPhysics3DWorld();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1 });
    addPhysics3DJoint(world, joint);
    joint.length = Number.NaN;

    expect(isPhysics3DJointStateValid(world)).toBe(false);
  });

  it('accepts a world with no joints', () => {
    expect(isPhysics3DJointStateValid(createTestWorld())).toBe(true);
  });

  it('rejects a joint with an empty kind or a non-integer endpoint', () => {
    const kind = createTestWorld();
    addPhysics3DJoint(kind, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 })).kind = '';
    expect(isPhysics3DJointStateValid(kind)).toBe(false);

    const endpoint = createTestWorld();
    addPhysics3DJoint(endpoint, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 })).bodyB = 1.5;
    expect(isPhysics3DJointStateValid(endpoint)).toBe(false);
  });

  it('rejects a non-finite field a kind added, not only the common ones', () => {
    const world = createTestWorld();
    const joint = addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: 0, bodyB: 1 }));
    (joint as unknown as Record<string, number>).acmeSuspensionTravel = Number.NaN;

    // Walking the object rather than a fixed key list is what makes this cover a user's own joint kind,
    // which is the point of an open registry.
    expect(isPhysics3DJointStateValid(world)).toBe(false);
  });
});

describe('isPhysics3DPositionIterationsValid', () => {
  it('accepts zero and rejects a negative or fractional count', () => {
    const world = createTestWorld();
    world.config.sequentialImpulse.positionIterations = 0;
    expect(isPhysics3DPositionIterationsValid(world.config)).toBe(true);

    world.config.sequentialImpulse.positionIterations = -1;
    expect(isPhysics3DPositionIterationsValid(world.config)).toBe(false);

    world.config.sequentialImpulse.positionIterations = 2.5;
    expect(isPhysics3DPositionIterationsValid(world.config)).toBe(false);
  });
});

describe('isPhysics3DSolverConfigValid', () => {
  it('accepts the default tuning', () => {
    expect(isPhysics3DSolverConfigValid(createTestWorld().config)).toBe(true);
  });

  it('rejects a position correction outside zero to one', () => {
    const world = createTestWorld();
    world.config.sequentialImpulse.positionCorrection = 1.5;

    expect(isPhysics3DSolverConfigValid(world.config)).toBe(false);
  });

  it('rejects negative sleep thresholds and a negative slop', () => {
    const threshold = createTestWorld();
    threshold.config.sleepAngularThreshold = -1;
    expect(isPhysics3DSolverConfigValid(threshold.config)).toBe(false);

    const slop = createTestWorld();
    slop.config.sequentialImpulse.penetrationSlop = -0.01;
    expect(isPhysics3DSolverConfigValid(slop.config)).toBe(false);
  });

  it('does not speak for the iteration counts or substeps', () => {
    const world = createTestWorld();
    world.config.substeps = 0;
    world.config.sequentialImpulse.velocityIterations = -4;

    // Those three are asked separately, because they are the ones a caller is most likely to have tuned by
    // hand and the explanation names each of them.
    expect(isPhysics3DSolverConfigValid(world.config)).toBe(true);
  });
});

describe('isPhysics3DSubstepsValid', () => {
  it('requires at least one whole sub-interval', () => {
    const world = createTestWorld();
    expect(isPhysics3DSubstepsValid(world.config)).toBe(true);

    for (const substeps of [0, -1, 1.5, Number.NaN]) {
      world.config.substeps = substeps;
      expect(isPhysics3DSubstepsValid(world.config)).toBe(false);
    }
  });
});

describe('isPhysics3DTimestepValid', () => {
  it('requires a finite positive interval', () => {
    expect(isPhysics3DTimestepValid(1 / 60)).toBe(true);
    expect(isPhysics3DTimestepValid(0)).toBe(false);
    expect(isPhysics3DTimestepValid(-1)).toBe(false);
    expect(isPhysics3DTimestepValid(Number.NaN)).toBe(false);
    expect(isPhysics3DTimestepValid(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isPhysics3DVelocityIterationsValid', () => {
  it('accepts zero and rejects a negative or fractional count', () => {
    const world = createTestWorld();
    world.config.sequentialImpulse.velocityIterations = 0;
    expect(isPhysics3DVelocityIterationsValid(world.config)).toBe(true);

    world.config.sequentialImpulse.velocityIterations = -1;
    expect(isPhysics3DVelocityIterationsValid(world.config)).toBe(false);

    world.config.sequentialImpulse.velocityIterations = 0.5;
    expect(isPhysics3DVelocityIterationsValid(world.config)).toBe(false);
  });
});

function createTestWorld(): Physics3DWorld {
  const world = createPhysics3DWorld();
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  addPhysics3DBody(world, createRigidBody3D('dynamic'));
  return world;
}
