import type {
  Physics3DConeTwistJoint,
  Physics3DGeneric6DofJoint,
  Physics3DHingeJoint,
  Physics3DJoint,
  Physics3DJointSolver,
  Physics3DSliderJoint,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { integrateRigidBody3DPose, refreshRigidBody3DWorldInertia } from './integrate';
import {
  createPhysics3DConeTwistJoint,
  createPhysics3DDistanceJoint,
  createPhysics3DFixedJoint,
  createPhysics3DGeneric6DofJoint,
  createPhysics3DHingeJoint,
  createPhysics3DSliderJoint,
} from './jointFactories';
import { writePhysics3DJointAnchorVelocity, writePhysics3DJointAnchors } from './jointMath';
import {
  physics3DBallAndSocketJointSolver,
  physics3DConeTwistJointSolver,
  physics3DDistanceJointSolver,
  physics3DFixedJointSolver,
  physics3DGeneric6DofJointSolver,
  physics3DHingeJointSolver,
  physics3DSliderJointSolver,
  Physics3DBallAndSocketJointKind,
  Physics3DConeTwistJointKind,
  Physics3DDistanceJointKind,
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
      Physics3DDistanceJointKind,
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

describe('physics3DDistanceJointSolver', () => {
  it('cancels the velocity changing the separation', () => {
    const scene = createScene();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    scene.bodyB.velocityX = 4;

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(Math.abs(separationSpeed(scene))).toBeLessThan(1e-9);
  });

  it('leaves motion PERPENDICULAR to the axis alone', () => {
    // The single row is what distinguishes this from a ball-and-socket. A pair swinging sideways keeps its
    // distance, so the joint has nothing to resist, and a kind that quietly constrained the other two axes
    // would turn a pendulum into a rigid rod right here.
    const scene = createScene();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    scene.bodyB.velocityY = 3;

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(scene.bodyB.velocityY).toBeCloseTo(3, 9);
  });

  it('leaves relative rotation free', () => {
    const scene = createScene();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    scene.bodyB.angularVelocityY = 3;

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(scene.bodyB.angularVelocityY).toBeCloseTo(3, 9);
  });

  it('pulls a stretched pair together and pushes a compressed pair apart', () => {
    const stretched = createScene();
    stretched.bodyB.x = 4;
    const stretchedJoint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    solveJoint(stretched.world, stretchedJoint, physics3DDistanceJointSolver, 8);
    expect(stretched.bodyB.velocityX).toBeLessThan(0);
    expect(stretched.bodyA.velocityX).toBeGreaterThan(0);

    const compressed = createScene();
    compressed.bodyB.x = 1;
    const compressedJoint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    solveJoint(compressed.world, compressedJoint, physics3DDistanceJointSolver, 8);
    expect(compressed.bodyB.velocityX).toBeGreaterThan(0);
    expect(compressed.bodyA.velocityX).toBeLessThan(0);
  });

  it('IS SLACK INSIDE ITS LIMIT INTERVAL, which is what makes it a rope', () => {
    // The behaviour a cable exists for, and the reason enabling the limit drops the rest-length row: a joint
    // that still held `length` here would be a strut wearing a rope's parameters.
    const scene = createScene();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2, enableLimit: true, maxLength: 5 });
    scene.bodyB.velocityX = 4;

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(scene.bodyB.velocityX).toBeCloseTo(4, 9);
    expect(scene.bodyA.velocityX).toBeCloseTo(0, 9);
  });

  it('catches the pair at its maximum length', () => {
    const scene = createScene();
    scene.bodyB.x = 6;
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, enableLimit: true, maxLength: 5 });
    scene.bodyB.velocityX = 4;

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(scene.bodyB.velocityX).toBeLessThan(0);
  });

  it('holds the pair apart at its minimum length', () => {
    const scene = createScene();
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, enableLimit: true, minLength: 4, maxLength: 9 });

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    // Two units apart against a floor of four, so the lower row must push rather than pull.
    expect(scene.bodyB.velocityX).toBeGreaterThan(0);
    expect(scene.bodyA.velocityX).toBeLessThan(0);
  });

  it('never PULLS at its maximum, only catches', () => {
    // A one-sided row that acted in both directions would read as a working joint in every test above while
    // silently making the interval rigid at whichever bound was nearest.
    const scene = createScene();
    scene.bodyB.x = 3;
    scene.bodyB.velocityX = -4;
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, enableLimit: true, minLength: 0, maxLength: 5 });

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(scene.bodyB.velocityX).toBeCloseTo(-4, 9);
  });

  it('yields under load where the rigid form does not', () => {
    // The measurable difference a spring makes. Same displacement, same iterations: the soft row's
    // compliance means it cannot remove the whole approach at once, and the rigid one can.
    const rigid = createScene();
    rigid.bodyB.x = 4;
    const rigidJoint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });
    solveJoint(rigid.world, rigidJoint, physics3DDistanceJointSolver, 8);

    const soft = createScene();
    soft.bodyB.x = 4;
    const softJoint = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 2,
      enableSpring: true,
      frequencyHz: 2,
      dampingRatio: 0.5,
    });
    solveJoint(soft.world, softJoint, physics3DDistanceJointSolver, 8);

    expect(Math.abs(soft.bodyB.velocityX)).toBeLessThan(Math.abs(rigid.bodyB.velocityX));
  });

  it('SETTLES A SPRING AT ITS REST LENGTH over time', () => {
    // The claim a frequency and a damping ratio actually make. A critically damped spring converges on the
    // rest length; the assertion is convergence rather than a fixed path, because how it gets there is the
    // spring's business and only the destination is the contract.
    const scene = createScene();
    makeStatic(scene.bodyA);
    scene.bodyB.x = 5;
    const joint = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 2,
      enableSpring: true,
      frequencyHz: 4,
      dampingRatio: 1,
    });

    for (let step = 0; step < 240; step += 1) {
      solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);
      integrateRigidBody3DPose(scene.bodyB, 1 / 60);
    }

    expect(scene.bodyB.x).toBeCloseTo(2, 2);
  });

  it('settles a stiffer spring faster than a looser one', () => {
    // Frequency has to be monotonic in stiffness, or it is a tuning knob rather than a unit.
    const looseScene = createScene();
    makeStatic(looseScene.bodyA);
    looseScene.bodyB.x = 5;
    const loose = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 2,
      enableSpring: true,
      frequencyHz: 1,
      dampingRatio: 1,
    });

    const stiffScene = createScene();
    makeStatic(stiffScene.bodyA);
    stiffScene.bodyB.x = 5;
    const stiff = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 2,
      enableSpring: true,
      frequencyHz: 6,
      dampingRatio: 1,
    });

    for (let step = 0; step < 30; step += 1) {
      solveJoint(looseScene.world, loose, physics3DDistanceJointSolver, 8);
      integrateRigidBody3DPose(looseScene.bodyB, 1 / 60);
      solveJoint(stiffScene.world, stiff, physics3DDistanceJointSolver, 8);
      integrateRigidBody3DPose(stiffScene.bodyB, 1 / 60);
    }

    expect(Math.abs(stiffScene.bodyB.x - 2)).toBeLessThan(Math.abs(looseScene.bodyB.x - 2));
  });

  it('BOUNDS A SPRING BY ITS LIMITS rather than letting it stretch through them', () => {
    // Spring and limit together is a suspension with travel stops, and the stop has to win. This is why the
    // limit rows read the unsoftened effective mass: given the spring's compliance they would yield too.
    const scene = createScene();
    makeStatic(scene.bodyA);
    scene.bodyB.x = 2;
    const joint = createPhysics3DDistanceJoint({
      bodyA: 0,
      bodyB: 1,
      length: 20,
      enableSpring: true,
      frequencyHz: 6,
      dampingRatio: 0.1,
      enableLimit: true,
      minLength: 0,
      maxLength: 4,
    });

    for (let step = 0; step < 240; step += 1) {
      solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);
      integrateRigidBody3DPose(scene.bodyB, 1 / 60);
    }

    // The spring pulls toward 20 and the stop sits at 4, so the stop is what holds.
    expect(scene.bodyB.x).toBeLessThan(4.1);
  });

  it('clears its limit accumulators on request', () => {
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, enableLimit: true, maxLength: 1 });
    joint.impulse0 = 5;
    joint.lowerLimitImpulse = 3;
    joint.upperLimitImpulse = 7;

    physics3DDistanceJointSolver.clearAccumulatedImpulses?.(joint);

    expect(joint.impulse0).toBe(0);
    expect(joint.lowerLimitImpulse).toBe(0);
    expect(joint.upperLimitImpulse).toBe(0);
  });

  it('accepts an exchange of ends, having nothing signed to reverse', () => {
    // A length reads the same from either end, which is why this kind's `swapEnds` reverses nothing. If it
    // ever grows a signed quantity, this is the test that should stop being true.
    const joint = createPhysics3DDistanceJoint({ bodyA: 1, bodyB: 0, length: 2 });

    expect(physics3DDistanceJointSolver.swapEnds?.(joint)).toBe(true);
  });

  it('survives coincident anchors without producing NaN', () => {
    // A zero separation leaves the axis undefined. Normalizing by it would put NaN into both bodies, and NaN
    // in a solver never leaves — it spreads to every body the island touches.
    const scene = createScene();
    scene.bodyB.x = 0;
    const joint = createPhysics3DDistanceJoint({ bodyA: 0, bodyB: 1, length: 2 });

    solveJoint(scene.world, joint, physics3DDistanceJointSolver, 8);

    expect(Number.isFinite(scene.bodyB.velocityX)).toBe(true);
    expect(Number.isFinite(scene.bodyB.velocityY)).toBe(true);
    expect(Number.isFinite(scene.bodyB.velocityZ)).toBe(true);
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

  it('carries a limited axis accumulator but drops it when the axis stops being limited', () => {
    const scene = createScene();
    makeStatic(scene.bodyA);
    const joint = createPhysics3DGeneric6DofJoint({
      bodyA: 0,
      bodyB: 1,
      lowerAngularX: -0.05,
      upperAngularX: 0.05,
    });
    setAxisAngle(scene.bodyB, 1, 0, 0, 0.2);

    scene.bodyB.angularVelocityX = 1;
    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 4);
    expect(joint.upperLimitImpulses[3]).toBeGreaterThan(0);

    // Widening the bounds past the pose makes the axis FREE, and an accumulator describing a bound the
    // joint is no longer anywhere near must not survive into the next prepare.
    joint.lowerAngularX = 1;
    joint.upperAngularX = -1;
    solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 1);
    expect(joint.upperLimitImpulses[3]).toBe(0);
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

  it('carries a limit impulse across steps and reapplies it before the first iteration', () => {
    const { scene, joint } = createLoadedHingeStop();
    scene.bodyB.angularVelocityX = 1;
    solveJoint(scene.world, joint, physics3DHingeJointSolver, 4);
    expect(joint.upperLimitImpulse).toBeGreaterThan(0);

    // A whole step with ZERO velocity iterations, so nothing but warm starting can move the body. This is
    // the assertion that the carried value is actually reapplied rather than merely stored — deliberately
    // not a "converges in fewer iterations" comparison, because an isolated one-sided row has an exact
    // effective mass and reaches the same answer from any starting point in a single iteration. Warm
    // starting pays off where the limit competes with the point and lock rows, not here.
    const before = scene.bodyB.angularVelocityX;
    solveJoint(scene.world, joint, physics3DHingeJointSolver, 0);

    expect(scene.bodyB.angularVelocityX).toBeLessThan(before);
  });

  it('drops a carried limit impulse when the limit is turned off', () => {
    const { scene, joint } = createLoadedHingeStop();
    scene.bodyB.angularVelocityX = 1;
    solveJoint(scene.world, joint, physics3DHingeJointSolver, 4);
    expect(joint.upperLimitImpulse).toBeGreaterThan(0);

    // Same rule the motor already followed: a cached impulse is valid only while the row that produced it is
    // still solved, or a disabled stop keeps pushing forever with nothing to cancel it.
    joint.enableLimit = false;
    solveJoint(scene.world, joint, physics3DHingeJointSolver, 1);
    expect(joint.upperLimitImpulse).toBe(0);
  });

  it('exchanges rather than negates the limit accumulators when its ends are swapped', () => {
    const joint = createPhysics3DHingeJoint({ bodyA: 1, bodyB: 0, enableLimit: true, lowerAngle: -1, upperAngle: 1 });
    joint.lowerLimitImpulse = 3;
    joint.upperLimitImpulse = 7;

    physics3DHingeJointSolver.swapEnds?.(joint);

    // Both stay non-negative: each is a magnitude whose direction is carried by the row that owns it, so the
    // push that held the lower bound is the one that now holds the upper.
    expect(joint.lowerLimitImpulse).toBe(7);
    expect(joint.upperLimitImpulse).toBe(3);
  });

  it('rescales carried limit accumulators with the timestep', () => {
    const joint = createPhysics3DHingeJoint({ bodyA: 0, bodyB: 1, enableLimit: true });
    joint.lowerLimitImpulse = 2;
    joint.upperLimitImpulse = 5;

    physics3DHingeJointSolver.scaleAccumulatedImpulses?.(joint, 0.5);

    // An accumulated impulse has force-times-time units, so reusing one across a different interval applies
    // the wrong force before the first iteration can correct it.
    expect(joint.lowerLimitImpulse).toBe(1);
    expect(joint.upperLimitImpulse).toBe(2.5);
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

describe('physics3DJointSoftLimits', () => {
  // A loaded hinge stop, solved once as a hard limit and once as a spring. Everything else is identical,
  // so any difference is the compliance.
  function solveLoadedStop(soft: boolean, frequencyHz = 4, dampingRatio = 0.7): Physics3DHingeJoint {
    const { scene, joint } = createLoadedHingeStop();
    joint.enableLimitSpring = soft;
    joint.limitFrequencyHz = frequencyHz;
    joint.limitDampingRatio = dampingRatio;
    solveJoint(scene.world, joint, physics3DHingeJointSolver, 8);
    return joint;
  }

  it('yields more than a hard stop under the same load', () => {
    // The whole point of a spring stop: it resists, but it gives. A compliant row reaching for the same
    // impulse as a hard one would mean the softening never took effect.
    const hard = solveLoadedStop(false);
    const soft = solveLoadedStop(true);
    expect(soft.upperLimitImpulse).toBeGreaterThan(0);
    expect(soft.upperLimitImpulse).toBeLessThan(hard.upperLimitImpulse);
  });

  it('stiffens toward the hard stop as frequency rises', () => {
    // Monotonic in frequency, which is what makes the parameter tunable rather than merely present.
    const slack = solveLoadedStop(true, 2);
    const stiff = solveLoadedStop(true, 30);
    const hard = solveLoadedStop(false);
    expect(slack.upperLimitImpulse).toBeLessThan(stiff.upperLimitImpulse);
    expect(stiff.upperLimitImpulse).toBeLessThanOrEqual(hard.upperLimitImpulse + 1e-9);
  });

  it('degrades EXACTLY to a hard stop when the frequency is zero', () => {
    // "Spring enabled but never configured" must not be a third behaviour. Exact equality rather than a
    // tolerance: the code path is supposed to be the same one, not merely a close one.
    const hard = solveLoadedStop(false);
    const unconfigured = solveLoadedStop(true, 0);
    expect(unconfigured.upperLimitImpulse).toBe(hard.upperLimitImpulse);
    expect(unconfigured.lowerLimitImpulse).toBe(hard.lowerLimitImpulse);
  });

  it('stays ONE-SIDED, never pulling the coordinate back through the bound', () => {
    // Softening changes how hard a stop resists, never whether it may reverse. A spring that could pull
    // would be a rest length, which is a different joint.
    const soft = solveLoadedStop(true);
    expect(soft.lowerLimitImpulse).toBe(0);
    expect(soft.upperLimitImpulse).toBeGreaterThanOrEqual(0);
  });

  it('softens a slider travel stop the same way', () => {
    function solveSlider(soft: boolean): Physics3DSliderJoint {
      const scene = createScene();
      makeStatic(scene.bodyA);
      scene.bodyB.x = 3;
      const joint = createPhysics3DSliderJoint({
        bodyA: 0,
        bodyB: 1,
        enableLimit: true,
        lowerTranslation: -0.5,
        upperTranslation: 0.5,
      });
      joint.enableLimitSpring = soft;
      joint.limitFrequencyHz = 4;
      joint.limitDampingRatio = 0.7;
      solveJoint(scene.world, joint, physics3DSliderJointSolver, 8);
      return joint;
    }
    const hard = solveSlider(false);
    const soft = solveSlider(true);
    expect(Math.abs(soft.upperLimitImpulse)).toBeLessThan(Math.abs(hard.upperLimitImpulse));
  });

  it('softens a cone-twist twist stop, whose bias slot it shares with the swing stop', () => {
    // Swing and twist write the SAME bias slot from two different row masses. That is only sound because
    // the soft bias factor is mass-independent; if it were not, the second write would corrupt the first.
    function solveCone(soft: boolean): Physics3DConeTwistJoint {
      const scene = createScene();
      makeStatic(scene.bodyA);
      setAxisAngle(scene.bodyB, 1, 0, 0, 0.4);
      const joint = createPhysics3DConeTwistJoint({
        bodyA: 0,
        bodyB: 1,
        enableTwistLimit: true,
        lowerTwistAngle: -0.05,
        upperTwistAngle: 0.05,
      });
      joint.enableLimitSpring = soft;
      joint.limitFrequencyHz = 4;
      joint.limitDampingRatio = 0.7;
      solveJoint(scene.world, joint, physics3DConeTwistJointSolver, 8);
      return joint;
    }
    const hard = solveCone(false);
    const soft = solveCone(true);
    const hardTotal = hard.lowerTwistImpulse + hard.upperTwistImpulse;
    const softTotal = soft.lowerTwistImpulse + soft.upperTwistImpulse;
    expect(softTotal).toBeGreaterThan(0);
    expect(softTotal).toBeLessThan(hardTotal);
  });

  it('softens a 6-DOF axis limit', () => {
    function solveDof(soft: boolean): Physics3DGeneric6DofJoint {
      const scene = createScene();
      makeStatic(scene.bodyA);
      scene.bodyB.x = 3;
      const joint = createPhysics3DGeneric6DofJoint({
        bodyA: 0,
        bodyB: 1,
        lowerLinearX: -0.5,
        upperLinearX: 0.5,
      });
      joint.enableLimitSpring = soft;
      joint.limitFrequencyHz = 4;
      joint.limitDampingRatio = 0.7;
      solveJoint(scene.world, joint, physics3DGeneric6DofJointSolver, 8);
      return joint;
    }
    const hard = solveDof(false);
    const soft = solveDof(true);
    expect(soft.upperLimitImpulses[0]).toBeGreaterThan(0);
    expect(soft.upperLimitImpulses[0]).toBeLessThan(hard.upperLimitImpulses[0]);
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

// The rate the two bodies' separation is changing, positive while they part. The distance joint constrains
// exactly this one scalar, so it is what a solved joint has to have driven to zero.
function separationSpeed(scene: Readonly<Scene>): number {
  const axisX = scene.bodyB.x - scene.bodyA.x;
  const axisY = scene.bodyB.y - scene.bodyA.y;
  const axisZ = scene.bodyB.z - scene.bodyA.z;
  const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
  if (length === 0) return 0;
  return (
    ((scene.bodyB.velocityX - scene.bodyA.velocityX) * axisX +
      (scene.bodyB.velocityY - scene.bodyA.velocityY) * axisY +
      (scene.bodyB.velocityZ - scene.bodyA.velocityZ) * axisZ) /
    length
  );
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

// A hinge held past its upper stop against a static end — the pose a warm-started limit is for. The angle
// never changes here because nothing integrates the pose, so the stop stays loaded step after step.
function createLoadedHingeStop(): { scene: Scene; joint: Physics3DHingeJoint } {
  const scene = createScene();
  makeStatic(scene.bodyA);
  setAxisAngle(scene.bodyB, 1, 0, 0, 0.2);
  const joint = createPhysics3DHingeJoint({
    bodyA: 0,
    bodyB: 1,
    enableLimit: true,
    lowerAngle: -0.05,
    upperAngle: 0.05,
  });
  return { scene, joint };
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
