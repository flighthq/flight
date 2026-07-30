import type {
  Physics2DDistanceJoint,
  Physics2DRevoluteJoint,
  Physics2DMouseJoint,
  Physics2DRopeJoint,
  Physics2DWeldJoint,
  Physics2DWorld,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { addPhysics2DJoint, registerPhysics2DJointSolver } from './jointRegistry';
import {
  Physics2DDistanceJointKind,
  Physics2DMouseJointKind,
  Physics2DRevoluteJointKind,
  Physics2DRopeJointKind,
  Physics2DWeldJointKind,
  physics2DDistanceJointSolver,
  physics2DMouseJointSolver,
  physics2DRevoluteJointSolver,
  physics2DRopeJointSolver,
  physics2DWeldJointSolver,
} from './joints';
import { stepPhysics2D } from './step';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };

function box(world: ReturnType<typeof createPhysics2DWorld>, type: 'dynamic' | 'static', x: number, y: number) {
  const body = createRigidBody2D(type, x, y);
  body.colliders.push(createPhysics2DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, maxX: 0.5, maxY: 0.5 }, STONE));
  return addPhysics2DBody(world, body);
}

function baseJoint(kind: string, bodyA: number, bodyB: number) {
  return {
    kind,
    bodyA,
    bodyB,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    collideConnected: false,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  };
}

function run(world: ReturnType<typeof createPhysics2DWorld>, steps: number): void {
  for (let i = 0; i < steps; i++) stepPhysics2D(world, 1 / 60);
}

describe('canonical end ordering and direction-bearing joint state', () => {
  // The generic swap in addPhysics2DJoint moves only what every joint has: two body indices and two
  // anchors. Anything a kind measures FROM bodyA TO bodyB reverses when the ends trade places, and the
  // registry cannot know which fields those are — so each kind now answers for its own via swapEnds.
  it('negates a weld reference angle when the ends are exchanged', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    // Supplied high-index-first, so the ends must be exchanged.
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, first.index, second.index),
      referenceAngle: 0.5,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
    expect(joint.referenceAngle).toBeCloseTo(-0.5, 12);
  });

  it('leaves a weld reference angle alone when no exchange happens', () => {
    // swapEnds both vetoes and transforms, so it must only be consulted when a swap is actually
    // pending — calling it unconditionally would negate the angle of every joint supplied in order.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const first = box(world, 'dynamic', 0, 0);
    const second = box(world, 'dynamic', 1, 0);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, first.index, second.index),
      referenceAngle: 0.5,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(first.index);
    expect(joint.referenceAngle).toBeCloseTo(0.5, 12);
  });

  it('holds the same physical pose whichever order the weld ends were supplied in', () => {
    // The property the negation exists for: the constraint is a fact about the pair, so which end the
    // caller happened to name first must not change where the bodies end up.
    function poseFor(supplyReversed: boolean): number {
      const world = createPhysics2DWorld(0, 0);
      registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
      const low = box(world, 'static', 0, 0);
      const high = box(world, 'dynamic', 1, 0);
      const joint: Physics2DWeldJoint = {
        ...baseJoint(
          Physics2DWeldJointKind,
          supplyReversed ? high.index : low.index,
          supplyReversed ? low.index : high.index,
        ),
        referenceAngle: supplyReversed ? -0.4 : 0.4,
      };
      addPhysics2DJoint(world, joint);
      run(world, 60);
      return high.angle;
    }
    expect(poseFor(true)).toBeCloseTo(poseFor(false), 6);
  });

  it('still swaps a direction-free kind, which needs no transform', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, first.index, second.index),
      length: 1,
      stiffness: 0,
      damping: 0,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
  });
});

describe('physics2DDistanceJointSolver', () => {
  it('holds a hanging body at the joint length instead of letting it fall', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 0, 3);
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      stiffness: 0,
      damping: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 240);

    const separation = Math.sqrt((bob.x - anchor.x) ** 2 + (bob.y - anchor.y) ** 2);
    expect(separation).toBeGreaterThan(1.9);
    expect(separation).toBeLessThan(2.1);
  });

  it('swings a displaced bob back under the anchor rather than holding it out sideways', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DDistanceJointKind, physics2DDistanceJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const bob = box(world, 'dynamic', 2, 5);
    bob.linearDamping = 1.5;
    const joint: Physics2DDistanceJoint = {
      ...baseJoint(Physics2DDistanceJointKind, anchor.index, bob.index),
      length: 2,
      stiffness: 0,
      damping: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 600);
    expect(bob.y).toBeLessThan(4);
  });
});

describe('physics2DMouseJointSolver', () => {
  it('drags a body toward its target', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);
    run(world, 120);
    expect(dragged.x).toBeGreaterThan(3);
  });

  it('respects its force bound rather than injecting unbounded energy', () => {
    // The reason a mouse joint is soft by construction: a rigid drag lets a user pull a body arbitrarily
    // fast simply by moving the cursor, and the rest of the world absorbs it.
    //
    // This assertion used to read `velocity < 60` with a maxForce of 0.5, which is not a force bound at
    // all — it passed while the solver was clamping the ACCUMULATED IMPULSE against maxForce, a unit
    // error worth 1/dt. The bound a force actually implies is dv <= F*dt/m per step, and that is what
    // is asserted now: at maxForce 1, dt 0.01, mass 1 the step may add 0.01 and no more, where the old
    // code added 1.0 and the old assertion waved it through.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const maxForce = 1;
    const dt = 0.01;
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
      targetX: 1000,
      targetY: 0,
      maxForce,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);

    const perStep = (maxForce * dt) / (1 / dragged.inverseMass);
    let previous = dragged.velocityX;
    for (let i = 0; i < 20; i++) {
      stepPhysics2D(world, dt);
      expect(Math.abs(dragged.velocityX - previous)).toBeLessThanOrEqual(perStep * 1.0000001);
      previous = dragged.velocityX;
    }
    expect(Number.isFinite(dragged.x)).toBe(true);
  });

  it('scales the impulse bound with the timestep, so the force means the same at any dt', () => {
    // A force bound that ignored dt would let a smaller step inject the same impulse more often.
    const speeds: number[] = [];
    for (const dt of [0.02, 0.01]) {
      const world = createPhysics2DWorld(0, 0);
      registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
      const dragged = box(world, 'dynamic', 0, 0);
      const joint: Physics2DMouseJoint = {
        ...baseJoint(Physics2DMouseJointKind, dragged.index, dragged.index),
        targetX: 1000,
        targetY: 0,
        maxForce: 1,
        stiffness: 5,
        damping: 0.7,
      };
      addPhysics2DJoint(world, joint);
      stepPhysics2D(world, dt);
      speeds.push(Math.abs(dragged.velocityX));
    }
    // Halving dt halves the impulse a single step may deliver.
    expect(speeds[1]).toBeCloseTo(speeds[0] / 2, 10);
  });

  it('drags the dynamic body even when it was added before its anchor', () => {
    // Canonical ordering swaps a joint's ends when the caller supplies them low-index-second. A mouse
    // joint has only one real body — the other end is a world-space target — so the exchange moved the
    // dragged body into bodyA while this solver acts on bodyB, and the drag silently applied to the
    // anchor. The dragged body did not move at all.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const dragged = box(world, 'dynamic', 0, 0);
    const anchor = box(world, 'static', 0, 0);
    expect(dragged.index).toBeLessThan(anchor.index);

    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, anchor.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyB).toBe(dragged.index);

    run(world, 60);
    expect(dragged.x).toBeGreaterThan(3);
    expect(anchor.x).toBe(0);
  });

  it('drags the dynamic body when it was added after its anchor', () => {
    // The orientation that already worked, kept so the veto cannot be "fixed" by breaking this one.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DMouseJointKind, physics2DMouseJointSolver);
    const anchor = box(world, 'static', 0, 0);
    const dragged = box(world, 'dynamic', 0, 0);
    const joint: Physics2DMouseJoint = {
      ...baseJoint(Physics2DMouseJointKind, anchor.index, dragged.index),
      targetX: 5,
      targetY: 0,
      maxForce: 1000,
      stiffness: 5,
      damping: 0.7,
    };
    addPhysics2DJoint(world, joint);
    expect(joint.bodyB).toBe(dragged.index);
    run(world, 60);
    expect(dragged.x).toBeGreaterThan(3);
  });
});

function revoluteJoint(
  bodyA: number,
  bodyB: number,
  over: Partial<Physics2DRevoluteJoint> = {},
): Physics2DRevoluteJoint {
  return {
    ...baseJoint(Physics2DRevoluteJointKind, bodyA, bodyB),
    enableLimit: false,
    enableMotor: false,
    lowerAngle: 0,
    maxMotorTorque: 0,
    motorImpulse: 0,
    motorSpeed: 0,
    referenceAngle: 0,
    upperAngle: 0,
    ...over,
  } as Physics2DRevoluteJoint;
}

describe('physics2DRevoluteJointSolver', () => {
  it('keeps the pinned anchors together while leaving rotation free', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const anchor = box(world, 'static', 0, 5);
    const arm = box(world, 'dynamic', 1, 5);
    const joint = {
      ...baseJoint(Physics2DRevoluteJointKind, anchor.index, arm.index),
      localAnchorAX: 0,
      localAnchorAY: 0,
      localAnchorBX: -1,
      localAnchorBY: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // The arm's anchor point must stay on the static body's anchor.
    const cos = Math.cos(arm.angle);
    const sin = Math.sin(arm.angle);
    const anchorX = arm.x + -1 * cos - 0 * sin;
    const anchorY = arm.y + -1 * sin + 0 * cos;
    expect(Math.abs(anchorX - anchor.x)).toBeLessThan(0.15);
    expect(Math.abs(anchorY - anchor.y)).toBeLessThan(0.15);
    // Rotation is free, so gravity must have swung it.
    expect(Math.abs(arm.angle)).toBeGreaterThan(0.05);
  });
});

describe('physics2DRevoluteJointSolver motor and limits', () => {
  // The type advertises a motor and an angular limit; the solver read none of those fields, so an
  // enabled motor left the arm at exactly zero angular velocity. These are the behaviours the header
  // promises, asserted against the numbers the promise implies rather than against "it moved".
  function hinged(world: Physics2DWorld) {
    const anchor = box(world, 'static', 0, 0);
    const arm = box(world, 'dynamic', 0, 0);
    return { anchor, arm };
  }

  it('drives the relative angular velocity to the motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 100, motorSpeed: 2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(2, 6);
    // Half a second at 2 rad/s.
    expect(arm.angle).toBeCloseTo(1, 3);
  });

  it('drives the relative angle the other way for a negative motor speed', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque: 100, motorSpeed: -2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(-2, 6);
  });

  it('does not drive the arm at all when the motor is disabled', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: false, maxMotorTorque: 100, motorSpeed: 2 }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(0, 9);
  });

  it('bounds the motor by its torque, so a small budget cannot reach the target speed', () => {
    // The torque bound is a torque: the accumulated impulse may not exceed maxMotorTorque * dt.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    const maxMotorTorque = 0.01;
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, { enableMotor: true, maxMotorTorque, motorSpeed: 100 }),
    );
    const dt = 1 / 60;
    let previous = arm.angularVelocity;
    for (let i = 0; i < 10; i++) {
      stepPhysics2D(world, dt);
      const perStep = maxMotorTorque * dt * arm.inverseInertia;
      expect(Math.abs(arm.angularVelocity - previous)).toBeLessThanOrEqual(perStep * 1.0000001);
      previous = arm.angularVelocity;
    }
    expect(arm.angularVelocity).toBeLessThan(100);
  });

  it('stops the arm at the upper limit instead of letting the motor carry it past', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -0.2,
        maxMotorTorque: 1000,
        motorSpeed: 5,
        upperAngle: 0.5,
      }),
    );
    run(world, 120);
    expect(arm.angle).toBeCloseTo(0.5, 6);
    expect(arm.angularVelocity).toBeCloseTo(0, 6);
  });

  it('stops the arm at the lower limit when driven the other way', () => {
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -0.3,
        maxMotorTorque: 1000,
        motorSpeed: -5,
        upperAngle: 0.5,
      }),
    );
    run(world, 120);
    expect(arm.angle).toBeCloseTo(-0.3, 6);
  });

  it('leaves the arm free to turn while it is inside the limit interval', () => {
    // The regression that cost the most to find: a limit whose bias is the violation depth rather
    // than the remaining room brakes ALL rotation, so an enabled limit the arm was nowhere near held
    // it at a standstill while the motor spent its whole torque budget every step.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const { anchor, arm } = hinged(world);
    addPhysics2DJoint(
      world,
      revoluteJoint(anchor.index, arm.index, {
        enableLimit: true,
        enableMotor: true,
        lowerAngle: -100,
        maxMotorTorque: 1000,
        motorSpeed: 5,
        upperAngle: 100,
      }),
    );
    run(world, 30);
    expect(arm.angularVelocity).toBeCloseTo(5, 6);
  });

  it('exchanges and negates the limit interval when the ends are swapped', () => {
    // lower <= (angleB - angleA - reference) <= upper. Reversing the ends negates that measurement, so
    // the same physical interval requires the bounds to negate AND trade places.
    const world = createPhysics2DWorld(0, 0);
    registerPhysics2DJointSolver(world, Physics2DRevoluteJointKind, physics2DRevoluteJointSolver);
    const second = box(world, 'dynamic', 0, 0);
    const first = box(world, 'dynamic', 1, 0);
    const joint = revoluteJoint(first.index, second.index, {
      lowerAngle: -0.2,
      motorSpeed: 3,
      referenceAngle: 0.1,
      upperAngle: 0.5,
    });
    addPhysics2DJoint(world, joint);
    expect(joint.bodyA).toBe(second.index);
    expect(joint.lowerAngle).toBeCloseTo(-0.5, 12);
    expect(joint.upperAngle).toBeCloseTo(0.2, 12);
    expect(joint.referenceAngle).toBeCloseTo(-0.1, 12);
    expect(joint.motorSpeed).toBeCloseTo(-3, 12);
  });
});

describe('physics2DRopeJointSolver', () => {
  it('goes slack inside its length and catches the body at full extension', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DRopeJointKind, physics2DRopeJointSolver);
    const anchor = box(world, 'static', 0, 10);
    const bob = box(world, 'dynamic', 0, 9.5);
    const joint: Physics2DRopeJoint = {
      ...baseJoint(Physics2DRopeJointKind, anchor.index, bob.index),
      maxLength: 3,
    };
    addPhysics2DJoint(world, joint);

    run(world, 30);
    // Still inside the rope's length: it must not have pulled the body back up.
    expect(anchor.y - bob.y).toBeLessThan(3.05);
    run(world, 300);
    expect(anchor.y - bob.y).toBeLessThan(3.2);
    expect(anchor.y - bob.y).toBeGreaterThan(2.8);
  });
});

describe('physics2DWeldJointSolver', () => {
  it('locks the relative angle as well as the anchor point', () => {
    const world = createPhysics2DWorld();
    registerPhysics2DJointSolver(world, Physics2DWeldJointKind, physics2DWeldJointSolver);
    const post = box(world, 'static', 0, 5);
    const welded = box(world, 'dynamic', 1, 5);
    const joint: Physics2DWeldJoint = {
      ...baseJoint(Physics2DWeldJointKind, post.index, welded.index),
      localAnchorBX: -1,
      localAnchorBY: 0,
      referenceAngle: 0,
    };
    addPhysics2DJoint(world, joint);
    run(world, 180);

    // A revolute would have swung; a weld holds the angle.
    expect(Math.abs(welded.angle)).toBeLessThan(0.2);
    expect(Math.abs(welded.y - 5)).toBeLessThan(0.3);
  });
});
