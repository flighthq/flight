import type { Physics2DJoint, Physics2DJointReaction, Physics2DWorld, RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { createPhysics2DJointReaction, writePhysics2DJointReaction } from './jointReactions';
import { addPhysics2DJoint } from './jointRegistry';
import {
  Physics2DDistanceJointKind,
  Physics2DGearJointKind,
  Physics2DMouseJointKind,
  Physics2DPrismaticJointKind,
  Physics2DPulleyJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWeldJointKind,
  Physics2DWheelJointKind,
} from './joints';
import { registerBuiltInPhysics2DJointSolvers } from './registerBuiltInPhysics2DJointSolvers';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

// Every assertion in this file is a STATICS check, not a comparison against the formula under test. A
// joint holding a weight still must push up with exactly that weight, and a joint holding an off-centre
// weight still must supply exactly the moment gravity applies about its anchor. Those are facts about
// the world rather than about the code, so a sign error, a missing ratio, or a mistaken state slot fails
// them — and none of them could be satisfied by an implementation that is merely self-consistent.
//
// The timestep is deliberately small and the settle deliberately long: the reaction reports what the
// solver CONVERGED on, so a coarse step reports its own residual error rather than the analytic answer.

const GRAVITY = -10;
const DT = 1 / 240;
const SETTLE_STEPS = 4000;
const MATERIAL = { density: 1, friction: 0, restitution: 0 };

function ball(world: Physics2DWorld, type: RigidBody2D['type'], x: number, y: number, offsetX = 0): RigidBody2D {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'circle', x: offsetX, y: 0, radius: 0.4 }, MATERIAL));
  return addPhysics2DBody(world, body);
}

function base(kind: string, bodyA: number, bodyB: number): Physics2DJoint {
  return {
    kind,
    bodyA,
    bodyB,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    collideConnected: false,
    breakForce: Number.POSITIVE_INFINITY,
    breakTorque: Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  };
}

function settledWorld(): Physics2DWorld {
  const world = createPhysics2DWorld(0, GRAVITY);
  registerBuiltInPhysics2DJointSolvers(world);
  return world;
}

function settle(world: Physics2DWorld, joint: Physics2DJoint, steps = SETTLE_STEPS): Physics2DJointReaction {
  addPhysics2DJoint(world, joint);
  for (let step = 0; step < steps; step++) stepPhysics2D(world, DT);
  const out = createPhysics2DJointReaction();
  expect(writePhysics2DJointReaction(world, joint, DT, out)).toBe(true);
  return out;
}

describe('createPhysics2DJointReaction', () => {
  it('starts at rest', () => {
    expect(createPhysics2DJointReaction()).toEqual({ forceX: 0, forceY: 0, torque: 0 });
  });

  it('allocates a fresh object each call, so two readings do not alias', () => {
    const first = createPhysics2DJointReaction();
    const second = createPhysics2DJointReaction();
    first.forceY = 5;
    expect(second.forceY).toBe(0);
  });
});

describe('writePhysics2DJointReaction', () => {
  it('reports a hanging weight for every kind that carries one along its axis', () => {
    // Five kinds, one law. Each holds the same bob against the same gravity by a different mechanism —
    // a rigid rod, a taut rope, a hinge, a weld, and a slider's perpendicular lane — and every one of
    // them must report the identical upward force, because the bob's weight does not care how it is held.
    for (const kind of [
      Physics2DDistanceJointKind,
      Physics2DRopeJointKind,
      Physics2DRevoluteJointKind,
      Physics2DWeldJointKind,
      Physics2DPrismaticJointKind,
    ]) {
      const world = settledWorld();
      const anchor = ball(world, 'static', 0, 0);
      const bob = ball(world, 'dynamic', 0, -2);
      const joint = base(kind, anchor.index, bob.index);
      if (kind === Physics2DDistanceJointKind) Object.assign(joint, { length: 2, frequencyHz: 0, dampingRatio: 0 });
      if (kind === Physics2DRopeJointKind) Object.assign(joint, { maxLength: 2 });
      if (kind === Physics2DRevoluteJointKind) {
        Object.assign(joint, {
          referenceAngle: 0,
          enableMotor: false,
          motorSpeed: 0,
          maxMotorTorque: 0,
          enableLimit: false,
          lowerAngle: 0,
          upperAngle: 0,
          motorImpulse: 0,
        });
      }
      if (kind === Physics2DWeldJointKind) Object.assign(joint, { referenceAngle: 0 });
      if (kind === Physics2DPrismaticJointKind) {
        Object.assign(joint, {
          localAxisAX: 1,
          localAxisAY: 0,
          referenceAngle: 0,
          enableMotor: false,
          motorSpeed: 0,
          maxMotorForce: 0,
          enableLimit: false,
          lowerTranslation: 0,
          upperTranslation: 0,
          motorImpulse: 0,
        });
      }

      const reaction = settle(world, joint);

      expect(reaction.forceY, kind).toBeCloseTo(bob.mass * -GRAVITY, 9);
      expect(reaction.forceX, kind).toBeCloseTo(0, 9);
      // Anchored through the centre of mass, so gravity has no lever arm and none of these five twists.
      expect(reaction.torque, kind).toBeCloseTo(0, 9);
    }
  });

  it('reports the suspension load a wheel spring carries', () => {
    const world = settledWorld();
    const hub = ball(world, 'static', 0, 0);
    const wheel = ball(world, 'dynamic', 0, -2);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DWheelJointKind, hub.index, wheel.index), {
        localAxisAX: 0,
        localAxisAY: 1,
        restTranslation: -2,
        frequencyHz: 4,
        dampingRatio: 0.7,
        enableMotor: false,
        motorSpeed: 0,
        maxMotorTorque: 0,
        motorImpulse: 0,
      }),
    );

    // A SPRING, so it settles slightly compressed rather than exactly at rest length, and the load it
    // reports is the weight to within that sag. Demanding exactness here would be demanding that a
    // suspension not compress.
    expect(reaction.forceY).toBeCloseTo(wheel.mass * -GRAVITY, 4);
    expect(reaction.forceX).toBeCloseTo(0, 9);
  });

  it('reports the tension in a pulley segment, which pulls toward its own ground anchor', () => {
    // A pulley is the one built-in whose two ends do NOT act on each other: each is pulled toward its
    // own ground point and the difference goes into the ground. Two equal weights balance, so each
    // segment carries exactly one weight.
    const world = settledWorld();
    const left = ball(world, 'dynamic', -1, -2);
    const right = ball(world, 'dynamic', 1, -2);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DPulleyJointKind, left.index, right.index), {
        groundAnchorAX: -1,
        groundAnchorAY: 0,
        groundAnchorBX: 1,
        groundAnchorBY: 0,
        ratio: 1,
        constant: 4,
      }),
    );

    expect(reaction.forceY).toBeCloseTo(right.mass * -GRAVITY, 9);
    expect(reaction.forceX).toBeCloseTo(0, 9);
  });

  it('reports the drag force a mouse joint spends holding a body against gravity', () => {
    const world = settledWorld();
    const bob = ball(world, 'dynamic', 0, 0);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DMouseJointKind, bob.index, bob.index), {
        targetX: 0,
        targetY: 0,
        maxForce: 1000,
        frequencyHz: 20,
        dampingRatio: 1,
      }),
    );

    expect(reaction.forceY).toBeCloseTo(bob.mass * -GRAVITY, 6);
  });

  it('reports the couple a weld supplies against an off-centre weight', () => {
    // The torque lane, checked by moment balance rather than by the formula. The arm's centre of mass
    // sits 1.5 to the right of the anchor, so gravity applies m*g*1.5 about it and the weld must supply
    // exactly the negative of that — while ALSO reporting the full weight as a force. Getting one lane
    // right and the other wrong fails here, which is the point of testing them together.
    const world = settledWorld();
    const post = ball(world, 'static', 0, 0);
    const arm = ball(world, 'dynamic', 0, 0, 1.5);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DWeldJointKind, post.index, arm.index), { referenceAngle: 0 }),
    );

    expect(reaction.torque).toBeCloseTo(-(arm.mass * GRAVITY * 1.5), 6);
    expect(reaction.forceY).toBeCloseTo(arm.mass * -GRAVITY, 6);
  });

  it('reports the motor torque a revolute joint spends holding an off-centre weight level', () => {
    const world = settledWorld();
    const post = ball(world, 'static', 0, 0);
    const arm = ball(world, 'dynamic', 0, 0, 1.5);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DRevoluteJointKind, post.index, arm.index), {
        referenceAngle: 0,
        enableMotor: true,
        motorSpeed: 0,
        maxMotorTorque: 1000,
        enableLimit: false,
        lowerAngle: 0,
        upperAngle: 0,
        motorImpulse: 0,
      }),
    );

    expect(reaction.torque).toBeCloseTo(-(arm.mass * GRAVITY * 1.5), 4);
    expect(reaction.forceY).toBeCloseTo(arm.mass * -GRAVITY, 6);
  });

  it('reports the torque a gear transmits, which is a real reaction and not an absent one', () => {
    // Two identical bodies geared 1:1 with a steady torque on the driver. The constraint makes them
    // counter-rotate, so the pair shares the torque evenly and the gear passes exactly half of it on —
    // negative, because B turns the other way.
    const world = createPhysics2DWorld(0, 0);
    registerBuiltInPhysics2DJointSolvers(world);
    const driver = ball(world, 'dynamic', 0, 0);
    const driven = ball(world, 'dynamic', 5, 0);
    const joint = Object.assign(base(Physics2DGearJointKind, driver.index, driven.index), {
      coordinateA: 'angular',
      coordinateB: 'angular',
      axisAX: 1,
      axisAY: 0,
      axisBX: 1,
      axisBY: 0,
      ratio: 1,
      constant: 0,
    });
    addPhysics2DJoint(world, joint);
    for (let step = 0; step < 200; step++) {
      driver.torque = 10;
      stepPhysics2D(world, DT);
    }

    const out = createPhysics2DJointReaction();
    expect(writePhysics2DJointReaction(world, joint, DT, out)).toBe(true);
    expect(out.torque).toBeCloseTo(-5, 6);
    expect(out.forceX).toBeCloseTo(0, 9);
    expect(out.forceY).toBeCloseTo(0, 9);
    expect(driven.angularVelocity).toBeCloseTo(-driver.angularVelocity, 6);
  });

  it('reports nothing for a rope that is slack, because a slack rope carries no load', () => {
    const world = settledWorld();
    const anchor = ball(world, 'static', 0, 0);
    const bob = ball(world, 'dynamic', 0, -1);
    // Rope longer than the separation and a floor to land on, so it never goes taut.
    const floor = createRigidBody2D('static', 0, -2);
    floor.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 }, MATERIAL));
    addPhysics2DBody(world, floor);
    const reaction = settle(
      world,
      Object.assign(base(Physics2DRopeJointKind, anchor.index, bob.index), { maxLength: 8 }),
    );

    // Closeness rather than identity only because a zero impulse times a negative axis component is
    // negative zero, which is the same force and a different value.
    expect(reaction.forceX).toBeCloseTo(0, 12);
    expect(reaction.forceY).toBeCloseTo(0, 12);
    expect(reaction.torque).toBeCloseTo(0, 12);
  });

  it('declines before the first step, when there is nothing yet to report', () => {
    const world = settledWorld();
    const anchor = ball(world, 'static', 0, 0);
    const bob = ball(world, 'dynamic', 0, -2);
    const joint = Object.assign(base(Physics2DDistanceJointKind, anchor.index, bob.index), {
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    });
    addPhysics2DJoint(world, joint);

    const out = createPhysics2DJointReaction();
    expect(writePhysics2DJointReaction(world, joint, DT, out)).toBe(false);
    expect(out).toEqual({ forceX: 0, forceY: 0, torque: 0 });
  });

  it('declines for a kind whose solver was never registered', () => {
    const world = createPhysics2DWorld(0, GRAVITY);
    const anchor = ball(world, 'static', 0, 0);
    const bob = ball(world, 'dynamic', 0, -2);
    const joint = base('acme.Unregistered', anchor.index, bob.index);
    addPhysics2DJoint(world, joint);
    stepPhysics2D(world, DT);

    const out = createPhysics2DJointReaction();
    expect(writePhysics2DJointReaction(world, joint, DT, out)).toBe(false);
  });

  it('declines for a timestep that cannot express a force, and zeroes the output first', () => {
    // The conversion is a division by dt, so a zero or non-finite step has no answer rather than an
    // infinite one. `out` is cleared before the check so a caller reusing a scratch reaction cannot read
    // the previous joint's numbers back as this one's.
    const world = settledWorld();
    const anchor = ball(world, 'static', 0, 0);
    const bob = ball(world, 'dynamic', 0, -2);
    const joint = Object.assign(base(Physics2DDistanceJointKind, anchor.index, bob.index), {
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    });
    const out = settle(world, joint, 200);
    expect(out.forceY).toBeGreaterThan(0);

    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(writePhysics2DJointReaction(world, joint, bad, out)).toBe(false);
      expect(out).toEqual({ forceX: 0, forceY: 0, torque: 0 });
    }
  });

  it('scales with the timestep it is told, since a force is an impulse per unit time', () => {
    const world = settledWorld();
    const anchor = ball(world, 'static', 0, 0);
    const bob = ball(world, 'dynamic', 0, -2);
    const joint = Object.assign(base(Physics2DDistanceJointKind, anchor.index, bob.index), {
      length: 2,
      frequencyHz: 0,
      dampingRatio: 0,
    });
    const atStepSize = settle(world, joint);

    const halved = createPhysics2DJointReaction();
    writePhysics2DJointReaction(world, joint, DT * 2, halved);
    expect(halved.forceY).toBeCloseTo(atStepSize.forceY / 2, 9);
  });
});
