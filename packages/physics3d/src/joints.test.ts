import type { Physics3DJoint, Physics3DJointSolver, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { refreshRigidBody3DWorldInertia } from './integrate';
import {
  createPhysics3DConeTwistJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DSliderJoint,
} from './jointFactories';
import { writePhysics3DJointAnchorVelocity, writePhysics3DJointAnchors } from './jointMath';
import {
  physics3DBallAndSocketJointSolver,
  physics3DConeTwistJointSolver,
  physics3DFixedJointSolver,
  physics3DGeneric6DofJointSolver,
  physics3DHingeJointSolver,
  physics3DSliderJointSolver,
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DFixedJointKind,
  Physics3DGeneric6DofJointKind,
  Physics3DHingeJointKind,
  Physics3DSliderJointKind,
} from './joints';
import { createPhysics3DMassData, setRigidBody3DMassData } from './massProperties';
import { addPhysics3DBody, createPhysics3DWorld, createRigidBody3D, setPhysics3DBodyType } from './world';

describe('Physics3DBallAndSocketJointKind', () => {
  it('names every built-in kind uniquely and without a vendor prefix', () => {
    const kinds = [
      Physics3DBallAndSocketJointKind,
      Physics3DConeTwistJointKind,
      Physics3DFixedJointKind,
      Physics3DGeneric6DofJointKind,
      Physics3DHingeJointKind,
      Physics3DSliderJointKind,
    ];

    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds.every((kind) => !kind.includes('.'))).toBe(true);
  });
});

describe('physics3DBallAndSocketJointSolver', () => {
  it('cancels the velocity separating the two anchors', () => {
    const scene = createScene();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1, localAnchorAX: 1, localAnchorBX: -1 });
    joint.kind = Physics3DBallAndSocketJointKind;
    scene.bodyB.velocityX = 4;
    scene.bodyB.velocityY = -2;

    solveJoint(scene.world, joint, physics3DBallAndSocketJointSolver, 8);

    expect(anchorSpeed(scene, joint)).toBeLessThan(1e-9);
  });

  it('leaves relative rotation completely free', () => {
    const scene = createScene();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
    joint.kind = Physics3DBallAndSocketJointKind;
    scene.bodyB.angularVelocityY = 3;

    solveJoint(scene.world, joint, physics3DBallAndSocketJointSolver, 8);

    // Both anchors sit on the centres of mass, so a pure spin moves neither and the joint has nothing to
    // resist. A kind that quietly locked an axis would show up here.
    expect(scene.bodyB.angularVelocityY).toBeCloseTo(3, 9);
  });

  it('pulls a separated pair back together', () => {
    const scene = createScene();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1, localAnchorAX: 1, localAnchorBX: -1 });
    joint.kind = Physics3DBallAndSocketJointKind;
    scene.bodyB.x = 4;

    solveJoint(scene.world, joint, physics3DBallAndSocketJointSolver, 8);

    // The anchors are 2 apart along +x, so the bias drives B back toward A.
    expect(scene.bodyB.velocityX).toBeLessThan(0);
    expect(scene.bodyA.velocityX).toBeGreaterThan(0);
  });
});

describe('physics3DConeTwistJointSolver', () => {
  it('leaves a swing inside the cone alone', () => {
    const scene = createScene();
    const joint = createPhysics3DConeTwistJoint({ bodyA: 0, bodyB: 1, swingLimitY: 1, swingLimitZ: 1 });
    scene.bodyB.angularVelocityZ = 0.5;

    solveJoint(scene.world, joint, physics3DConeTwistJointSolver, 16);

    // Both twist axes still coincide, so the joint is at the centre of its cone and has nothing to resist.
    expect(scene.bodyB.angularVelocityZ - scene.bodyA.angularVelocityZ).toBeCloseTo(0.5, 6);
  });

  it('pushes back on a swing past the cone', () => {
    const scene = createScene();
    // Half a radian of tilt about Z, well past a cone of 0.2.
    setAxisAngle(scene.bodyB, 0, 0, 1, 0.5);
    const joint = createPhysics3DConeTwistJoint({ bodyA: 0, bodyB: 1, swingLimitY: 0.2, swingLimitZ: 0.2 });

    solveJoint(scene.world, joint, physics3DConeTwistJointSolver, 16);

    // The swing axis for a tilt about +z is +z, so closing the cone means a negative relative spin about it.
    expect(scene.bodyB.angularVelocityZ - scene.bodyA.angularVelocityZ).toBeLessThan(0);
  });

  it('takes its cone from the axis the tilt is actually in', () => {
    const wide = createScene();
    setAxisAngle(wide.bodyB, 0, 0, 1, 0.5);
    // A tilt about +z carries the twist axis toward frame Y, so swingLimitY is the bound that applies.
    const wideJoint = createPhysics3DConeTwistJoint({ bodyA: 0, bodyB: 1, swingLimitY: 1.2, swingLimitZ: 0.05 });
    solveJoint(wide.world, wideJoint, physics3DConeTwistJointSolver, 16);

    const narrow = createScene();
    setAxisAngle(narrow.bodyB, 0, 0, 1, 0.5);
    const narrowJoint = createPhysics3DConeTwistJoint({ bodyA: 0, bodyB: 1, swingLimitY: 0.05, swingLimitZ: 1.2 });
    solveJoint(narrow.world, narrowJoint, physics3DConeTwistJointSolver, 16);

    expect(wide.bodyB.angularVelocityZ).toBeCloseTo(0, 9);
    expect(narrow.bodyB.angularVelocityZ).toBeLessThan(0);
  });

  it('bounds the twist without touching the swing', () => {
    const scene = createScene();
    setAxisAngle(scene.bodyB, 1, 0, 0, 0.5);
    const joint = createPhysics3DConeTwistJoint({
      bodyA: 0,
      bodyB: 1,
      enableSwingLimit: false,
      enableTwistLimit: true,
      lowerTwistAngle: -0.1,
      upperTwistAngle: 0.1,
    });

    solveJoint(scene.world, joint, physics3DConeTwistJointSolver, 16);

    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeLessThan(0);
  });

  it('refuses to exchange its ends', () => {
    const joint = createPhysics3DConeTwistJoint({ bodyA: 1, bodyB: 0 });

    expect(physics3DConeTwistJointSolver.swapEnds?.(joint)).toBe(false);
  });
});

describe('physics3DFixedJointSolver', () => {
  it('cancels relative rotation about every axis', () => {
    const scene = createScene();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1 });
    scene.bodyB.angularVelocityX = 1.5;
    scene.bodyB.angularVelocityY = -0.8;
    scene.bodyB.angularVelocityZ = 2.1;

    solveJoint(scene.world, joint, physics3DFixedJointSolver, 8);

    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(0, 9);
    expect(scene.bodyB.angularVelocityY - scene.bodyA.angularVelocityY).toBeCloseTo(0, 9);
    expect(scene.bodyB.angularVelocityZ - scene.bodyA.angularVelocityZ).toBeCloseTo(0, 9);
  });

  it('cancels relative anchor motion as well as rotation', () => {
    const scene = createScene();
    const joint = createPhysics3DFixedJoint({ bodyA: 0, bodyB: 1, localAnchorAX: 1, localAnchorBX: -1 });
    scene.bodyB.velocityZ = 3;
    scene.bodyB.angularVelocityY = 1;

    solveJoint(scene.world, joint, physics3DFixedJointSolver, 16);

    expect(anchorSpeed(scene, joint)).toBeLessThan(1e-6);
  });

  it('exchanges the frames when its ends are swapped', () => {
    const joint = createPhysics3DFixedJoint({
      bodyA: 0,
      bodyB: 1,
      localRotationAX: 1,
      localRotationAW: 0,
    });

    expect(physics3DFixedJointSolver.swapEnds?.(joint)).toBe(true);
    expect(joint.localRotationAX).toBe(0);
    expect(joint.localRotationAW).toBe(1);
    expect(joint.localRotationBX).toBe(1);
    expect(joint.localRotationBW).toBe(0);
  });
});

describe('physics3DGeneric6DofJointSolver', () => {
  it('constrains nothing when every axis is free', () => {
    const scene = createScene();
    const joint = createPhysics3DGeneric6DofJoint({ bodyA: 0, bodyB: 1 });
    scene.bodyB.velocityX = 1;
    scene.bodyB.velocityY = 2;
    scene.bodyB.angularVelocityZ = 3;

    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 16);

    expect(scene.bodyB.velocityX).toBeCloseTo(1, 9);
    expect(scene.bodyB.velocityY).toBeCloseTo(2, 9);
    expect(scene.bodyB.angularVelocityZ).toBeCloseTo(3, 9);
  });

  it('locks the one axis whose bounds are equal and leaves the rest free', () => {
    const scene = createScene();
    // A is the anchored end, so the row's coordinate is B's own displacement along the axis and reads
    // directly off B's velocity. With both ends dynamic the coordinate also carries A's rotation about its
    // lever arm, and a plain velocity difference is then measuring something the joint never constrained.
    makeStatic(scene.bodyA);
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerLinearY: 0,
      upperLinearY: 0,
    });
    scene.bodyB.velocityX = 1;
    scene.bodyB.velocityY = 2;

    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 16);

    expect(scene.bodyB.velocityY - scene.bodyA.velocityY).toBeCloseTo(0, 6);
    expect(scene.bodyB.velocityX).toBeCloseTo(1, 9);
  });

  it('lets a limited axis move within its interval', () => {
    const scene = createScene();
    // The anchors are 2 apart along +x, and the interval admits that.
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerLinearX: 1,
      upperLinearX: 3,
    });
    scene.bodyB.velocityX = 0.5;

    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 16);

    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeCloseTo(0.5, 6);
  });

  it('stops a limited axis at the end of its interval', () => {
    const scene = createScene();
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerLinearX: -1,
      upperLinearX: 1,
    });

    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 16);

    // The separation is 2, past the upper bound of 1, so the pair is drawn back together.
    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeLessThan(0);
  });

  it('locks an angular axis without disturbing the other two', () => {
    const scene = createScene();
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerAngularZ: 0,
      upperAngularZ: 0,
    });
    scene.bodyB.angularVelocityY = 1;
    scene.bodyB.angularVelocityZ = 2;

    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 16);

    expect(scene.bodyB.angularVelocityZ - scene.bodyA.angularVelocityZ).toBeCloseTo(0, 6);
    expect(scene.bodyB.angularVelocityY - scene.bodyA.angularVelocityY).toBeCloseTo(1, 6);
  });

  it('refuses to exchange its ends', () => {
    const joint = createPhysics3DGeneric6DofJoint({ bodyA: 1, bodyB: 0 });

    expect(physics3DGeneric6DofJointSolver.swapEnds?.(joint)).toBe(false);
  });
});

describe('physics3DHingeJointSolver', () => {
  it('leaves rotation about its own axis free while cancelling the other two', () => {
    const scene = createScene();
    const joint = createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 });
    scene.bodyB.angularVelocityX = 2;
    scene.bodyB.angularVelocityY = 1.3;
    scene.bodyB.angularVelocityZ = -0.9;

    solveJoint(scene.world, joint, physics3DHingeJointSolver, 16);

    // The frame's X axis is the hinge line, and with identity frames it is world +x.
    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(2, 6);
    expect(scene.bodyB.angularVelocityY - scene.bodyA.angularVelocityY).toBeCloseTo(0, 6);
    expect(scene.bodyB.angularVelocityZ - scene.bodyA.angularVelocityZ).toBeCloseTo(0, 6);
  });

  it('holds the hinge line even when the frames rotate it off the body axes', () => {
    const scene = createScene();
    const half = Math.SQRT1_2;
    // A quarter turn about Z carries the frame's X axis onto world +y for both bodies.
    const joint = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      localRotationAZ: half,
      localRotationAW: half,
      localRotationBZ: half,
      localRotationBW: half,
    });
    scene.bodyB.angularVelocityX = 1.1;
    scene.bodyB.angularVelocityY = 2;

    solveJoint(scene.world, joint, physics3DHingeJointSolver, 16);

    expect(scene.bodyB.angularVelocityY - scene.bodyA.angularVelocityY).toBeCloseTo(2, 6);
    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(0, 6);
  });

  it('drives the relative spin toward the motor speed', () => {
    const scene = createScene();
    const joint = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableMotor: true,
      motorSpeed: 3,
      maxMotorTorque: 1000,
    });

    solveJoint(scene.world, joint, physics3DHingeJointSolver, 16);

    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(3, 6);
  });

  it('bounds the motor by its torque budget rather than by the iteration count', () => {
    const fewer = createScene();
    const jointFewer = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableMotor: true,
      motorSpeed: 50,
      maxMotorTorque: 1,
    });
    solveJoint(fewer.world, jointFewer, physics3DHingeJointSolver, 4);

    const more = createScene();
    const jointMore = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableMotor: true,
      motorSpeed: 50,
      maxMotorTorque: 1,
    });
    solveJoint(more.world, jointMore, physics3DHingeJointSolver, 32);

    // A per-iteration clamp would make the motor eight times stronger in the second run — a motor that gets
    // stronger when the solver is tuned for accuracy.
    expect(more.bodyB.angularVelocityX).toBeCloseTo(fewer.bodyB.angularVelocityX, 9);
  });

  it('pushes back when the hinge angle is past its upper limit', () => {
    const scene = createScene();
    // A tenth of a radian about the hinge line, well past a limit of zero.
    setAxisAngle(scene.bodyB, 1, 0, 0, 0.1);
    const joint = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerAngle: -0.05,
      upperAngle: 0.05,
    });

    solveJoint(scene.world, joint, physics3DHingeJointSolver, 16);

    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeLessThan(0);
  });

  it('does not brake a hinge that is nowhere near its limits', () => {
    const scene = createScene();
    const joint = createPhysics3DHingeJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerAngle: -1,
      upperAngle: 1,
    });
    scene.bodyB.angularVelocityX = 0.5;

    solveJoint(scene.world, joint, physics3DHingeJointSolver, 16);

    // A limit whose bias clamped the signed error to zero on the inside would brake this to a standstill.
    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(0.5, 6);
  });

  it('reverses and exchanges the limit interval when its ends are swapped', () => {
    const joint = createPhysics3DHingeJoint({
      bodyA: 1,
      bodyB: 0,
      lowerAngle: -0.25,
      upperAngle: 1.5,
      motorSpeed: 4,
    });

    expect(physics3DHingeJointSolver.swapEnds?.(joint)).toBe(true);
    expect(joint.lowerAngle).toBe(-1.5);
    expect(joint.upperAngle).toBe(0.25);
    expect(joint.motorSpeed).toBe(-4);
    // Negating an absent accumulator has to produce zero, not NaN, which is what this catches.
    expect(joint.motorImpulse).toBeCloseTo(0, 12);
  });

  it('scales the motor accumulator with a changed timestep', () => {
    const joint = createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1 });
    joint.motorImpulse = 6;

    physics3DHingeJointSolver.scaleAccumulatedImpulses?.(joint, 0.5);

    expect(joint.motorImpulse).toBe(3);
  });
});

describe('physics3DSliderJointSolver', () => {
  it('leaves travel along its axis free while cancelling the other two', () => {
    const scene = createScene();
    // The rail is the anchored end — the ordinary way a slider is authored — which is also what makes the
    // row's coordinate equal to B's velocity along it rather than to a difference that carries A's spin.
    makeStatic(scene.bodyA);
    const joint = createPhysics3DSliderJoint({ bodyA: 0, bodyB: 1 });
    scene.bodyB.velocityX = 2;
    scene.bodyB.velocityY = 1.5;
    scene.bodyB.velocityZ = -1;

    solveJoint(scene.world, joint, physics3DSliderJointSolver, 24);

    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeCloseTo(2, 6);
    expect(scene.bodyB.velocityY - scene.bodyA.velocityY).toBeCloseTo(0, 6);
    expect(scene.bodyB.velocityZ - scene.bodyA.velocityZ).toBeCloseTo(0, 6);
  });

  it('locks relative rotation about every axis', () => {
    const scene = createScene();
    const joint = createPhysics3DSliderJoint({ bodyA: 0, bodyB: 1 });
    scene.bodyB.angularVelocityX = 1;
    scene.bodyB.angularVelocityY = -2;

    solveJoint(scene.world, joint, physics3DSliderJointSolver, 24);

    expect(scene.bodyB.angularVelocityX - scene.bodyA.angularVelocityX).toBeCloseTo(0, 6);
    expect(scene.bodyB.angularVelocityY - scene.bodyA.angularVelocityY).toBeCloseTo(0, 6);
  });

  it('drives the travel toward the motor speed', () => {
    const scene = createScene();
    const joint = createPhysics3DSliderJoint({
      bodyA: 0,
      bodyB: 1,
      enableMotor: true,
      motorSpeed: 4,
      maxMotorForce: 1000,
    });

    solveJoint(scene.world, joint, physics3DSliderJointSolver, 24);

    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeCloseTo(4, 6);
  });

  it('stops travel at the end of its interval', () => {
    const scene = createScene();
    const joint = createPhysics3DSliderJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerTranslation: -0.5,
      upperTranslation: 0.5,
    });

    solveJoint(scene.world, joint, physics3DSliderJointSolver, 24);

    // The anchors are 2 apart along the axis, past the upper bound.
    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeLessThan(0);
  });

  it('does not brake travel that is nowhere near its limits', () => {
    const scene = createScene();
    const joint = createPhysics3DSliderJoint({
      bodyA: 0,
      bodyB: 1,
      enableLimit: true,
      lowerTranslation: -5,
      upperTranslation: 5,
    });
    scene.bodyB.velocityX = 1;

    solveJoint(scene.world, joint, physics3DSliderJointSolver, 24);

    expect(scene.bodyB.velocityX - scene.bodyA.velocityX).toBeCloseTo(1, 6);
  });

  it('reverses and exchanges the travel interval when its ends are swapped', () => {
    const joint = createPhysics3DSliderJoint({
      bodyA: 1,
      bodyB: 0,
      lowerTranslation: -0.25,
      upperTranslation: 1.5,
      motorSpeed: 4,
    });

    expect(physics3DSliderJointSolver.swapEnds?.(joint)).toBe(true);
    expect(joint.lowerTranslation).toBe(-1.5);
    expect(joint.upperTranslation).toBe(0.25);
    expect(joint.motorSpeed).toBe(-4);
  });
});

function anchorSpeed(scene: Readonly<Scene>, joint: Physics3DJoint): number {
  writePhysics3DJointAnchors(scene.bodyA, scene.bodyB, joint);
  const velocity = [0, 0, 0];
  writePhysics3DJointAnchorVelocity(scene.bodyA, scene.bodyB, joint, velocity);
  return Math.sqrt(velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2]);
}

interface Scene {
  world: Physics3DWorld;
  bodyA: RigidBody3D;
  bodyB: RigidBody3D;
}

function createScene(): Scene {
  const world = createPhysics3DWorld();
  const bodyA = createUnitBody();
  const bodyB = createUnitBody();
  bodyB.x = 2;
  addPhysics3DBody(world, bodyA);
  addPhysics3DBody(world, bodyB);
  return { world, bodyA, bodyB };
}

function createUnitBody(): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  const data = createPhysics3DMassData();
  data.mass = 1;
  data.inertiaXX = 1;
  data.inertiaYY = 1;
  data.inertiaZZ = 1;
  setRigidBody3DMassData(body, data);
  refreshRigidBody3DWorldInertia(body);
  return body;
}

function makeStatic(body: RigidBody3D): void {
  setPhysics3DBodyType(body, 'static');
  refreshRigidBody3DWorldInertia(body);
}

function setAxisAngle(body: RigidBody3D, x: number, y: number, z: number, angle: number): void {
  const sine = Math.sin(angle / 2);
  body.orientationX = x * sine;
  body.orientationY = y * sine;
  body.orientationZ = z * sine;
  body.orientationW = Math.cos(angle / 2);
  refreshRigidBody3DWorldInertia(body);
}

// One substep of the sequential-impulse loop, in the order the step will call it: prepare, warm start, then
// the velocity iterations.
function solveJoint(
  world: Physics3DWorld,
  joint: Physics3DJoint,
  solver: Readonly<Physics3DJointSolver>,
  iterations: number,
  dt = 1 / 60,
): void {
  solver.prepare(world, joint, dt);
  solver.warmStart?.(world, joint);
  for (let i = 0; i < iterations; i += 1) solver.solve(world, joint, dt);
}
