import type {
  Physics3DFixedJoint,
  Physics3DHingeJoint,
  Physics3DJoint,
  Physics3DJointSolver,
  Physics3DWorld,
} from '@flighthq/types/contract';

import { swapPhysics3DJointFrames, writePhysics3DJointRotationError } from './jointMath';
import {
  applyRow,
  beginJointSolve,
  clearJointSolve,
  frameABasis,
  frameARotation,
  frameBBasis,
  frameBRotation,
  getJointSolveState,
  getRowMass,
  POINT_LENGTH,
  prepareAngularBlock,
  preparePointBlock,
  readFrameBases,
  readFrameRotations,
  ROW_LENGTH,
  solveAngularBlock,
  solveEqualityRow,
  solveLowerLimitRow,
  solveMotorRow,
  solvePointBlock,
  solveUpperLimitRow,
  warmStartAngularBlock,
  warmStartPointBlock,
  writeAngularRow,
} from './jointRows';
import { findPhysics3DBody } from './world';

// The built-in joint kinds. Bare names are reserved for these; a user's own joint takes a vendor prefix, and
// that convention rather than a registration guard is what keeps the two from colliding.
export const Physics3DBallAndSocketJointKind = 'BallAndSocket';
export const Physics3DConeTwistJointKind = 'ConeTwist';
export const Physics3DFixedJointKind = 'Fixed';
export const Physics3DGeneric6DofJointKind = 'Generic6Dof';
export const Physics3DHingeJointKind = 'Hinge';
export const Physics3DSliderJointKind = 'Slider';

// Pins two anchors together, leaving rotation free. Three coupled rows and nothing else — the simplest kind,
// and the one every other kind's point half is the same block of.
export const physics3DBallAndSocketJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }
    preparePointBlock(bodyA, bodyB, joint, beginJointSolve(joint, POINT_LENGTH), dt);
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    solvePointBlock(bodyA, bodyB, joint, state);
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    warmStartPointBlock(bodyA, bodyB, joint);
  },
};

// Pins two anchors together and locks the relative orientation. The point block plus the angular block, with
// no parameters of its own: a fixed joint is defined entirely by the pose it was authored in.
export const physics3DFixedJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    joint.impulse3 = 0;
    joint.impulse4 = 0;
    joint.impulse5 = 0;
  },

  // The frames travel with their bodies and nothing about them reverses: "these two frames coincide" reads
  // the same from either end. The generic swap moves the bodies and anchors; this moves the frames with them.
  swapEnds(joint: Physics3DJoint): boolean {
    swapPhysics3DJointFrames(joint as Physics3DFixedJoint);
    return true;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }
    const state = beginJointSolve(joint, FIXED_LENGTH);
    preparePointBlock(bodyA, bodyB, joint, state, dt);
    readFrameRotations(bodyA, bodyB, joint as Physics3DFixedJoint);
    prepareAngularBlock(bodyA, bodyB, state, FIXED_ANGULAR_MASS, FIXED_ANGULAR_BIAS, dt);
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    solveAngularBlock(bodyA, bodyB, joint, state, FIXED_ANGULAR_MASS, FIXED_ANGULAR_BIAS);
    solvePointBlock(bodyA, bodyB, joint, state);
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    warmStartPointBlock(bodyA, bodyB, joint);
    warmStartAngularBlock(bodyA, bodyB, joint);
  },
};

// Pins two anchors together and confines rotation to the frame's X axis, optionally motorized and limited.
//
// The point block, then two angular rows holding frame B's X onto frame A's, then a motor and a pair of
// limits sharing the axis row. The two lock rows are solved sequentially rather than as a coupled 2x2: they
// turn about perpendicular axes, so they couple only through an anisotropic inertia tensor, and the residual
// is what the remaining velocity iterations absorb.
export const physics3DHingeJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    joint.impulse3 = 0;
    joint.impulse4 = 0;
    (joint as Physics3DHingeJoint).motorImpulse = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const hinge = joint as Physics3DHingeJoint;
    hinge.motorImpulse = (hinge.motorImpulse ?? 0) * timestepRatio;
  },

  // The angle is measured from frame A's Y axis to frame B's about the shared X axis, so exchanging the ends
  // reverses it. The limit interval negates AND its ends exchange — the old lower bound becomes the new
  // upper — and the motor's target relative velocity reverses with it.
  //
  // Deriving the interval: the constraint is lower <= angle <= upper. After the swap the same physical
  // interval requires lower' = -upper and upper' = -lower.
  swapEnds(joint: Physics3DJoint): boolean {
    const hinge = joint as Physics3DHingeJoint;
    swapPhysics3DJointFrames(hinge);
    const lower = hinge.lowerAngle;
    hinge.lowerAngle = -hinge.upperAngle;
    hinge.upperAngle = -lower;
    hinge.motorSpeed = -hinge.motorSpeed;
    // Defaulted BEFORE the negation. This runs when the joint is added, ahead of the first prepare, so the
    // field may still be absent — and `-undefined` is NaN, which is not nullish, so a later `??` would accept
    // the poison rather than replace it.
    hinge.motorImpulse = -(hinge.motorImpulse ?? 0);
    return true;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const hinge = joint as Physics3DHingeJoint;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }

    const state = beginJointSolve(joint, HINGE_LENGTH);
    preparePointBlock(bodyA, bodyB, joint, state, dt);
    readFrameRotations(bodyA, bodyB, hinge);
    readFrameBases(bodyA, bodyB, hinge);

    writeAngularRow(state, HINGE_AXIS_ROW, frameABasis[0], frameABasis[1], frameABasis[2]);
    writeAngularRow(state, HINGE_LOCK_ROW0, frameABasis[3], frameABasis[4], frameABasis[5]);
    writeAngularRow(state, HINGE_LOCK_ROW1, frameABasis[6], frameABasis[7], frameABasis[8]);
    state[HINGE_AXIS_MASS] = getRowMass(bodyA, bodyB, state, HINGE_AXIS_ROW);
    state[HINGE_LOCK_MASS0] = getRowMass(bodyA, bodyB, state, HINGE_LOCK_ROW0);
    state[HINGE_LOCK_MASS1] = getRowMass(bodyA, bodyB, state, HINGE_LOCK_ROW1);

    // The two lock rows' positional error is the misalignment rotation projected onto the axes they turn
    // about. Its third component, about the hinge axis itself, is the one rotation the joint permits and is
    // deliberately not read here — the limits read the exact angle instead.
    writePhysics3DJointRotationError(
      frameARotation[0],
      frameARotation[1],
      frameARotation[2],
      frameARotation[3],
      frameBRotation[0],
      frameBRotation[1],
      frameBRotation[2],
      frameBRotation[3],
      rotationError,
    );
    state[HINGE_LOCK_ERROR0] = dot(rotationError, 0, frameABasis, 3);
    state[HINGE_LOCK_ERROR1] = dot(rotationError, 0, frameABasis, 6);
    state[HINGE_ANGLE] = getSignedAxisAngle(frameABasis, frameBBasis);

    state[HINGE_LOCK_BIAS] = BAUMGARTE / dt;
    state[HINGE_LIMIT_BIAS] = 1 / dt;
    state[HINGE_MAX_MOTOR] = Math.max(0, dt * hinge.maxMotorTorque);
    state[HINGE_LOWER_IMPULSE] = 0;
    state[HINGE_UPPER_IMPULSE] = 0;

    hinge.motorImpulse ??= 0;
    if (hinge.enableMotor) {
      hinge.motorImpulse = clamp(hinge.motorImpulse, -state[HINGE_MAX_MOTOR], state[HINGE_MAX_MOTOR]);
    } else {
      hinge.motorImpulse = 0;
    }
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const hinge = joint as Physics3DHingeJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    // Motor first: it is a soft target the limits are allowed to override, so solving it before them lets a
    // limit's impulse win within the same iteration when the two disagree.
    if (hinge.enableMotor && state[HINGE_AXIS_MASS] > 0) {
      hinge.motorImpulse = solveMotorRow(
        bodyA,
        bodyB,
        state,
        HINGE_AXIS_ROW,
        state[HINGE_AXIS_MASS],
        hinge.motorSpeed,
        state[HINGE_MAX_MOTOR],
        hinge.motorImpulse,
      );
    }

    if (hinge.enableLimit && state[HINGE_AXIS_MASS] > 0) {
      const angle = state[HINGE_ANGLE];
      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        HINGE_AXIS_ROW,
        state[HINGE_AXIS_MASS],
        angle - hinge.lowerAngle,
        state[HINGE_LIMIT_BIAS],
        HINGE_LOWER_IMPULSE,
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        HINGE_AXIS_ROW,
        state[HINGE_AXIS_MASS],
        hinge.upperAngle - angle,
        state[HINGE_LIMIT_BIAS],
        HINGE_UPPER_IMPULSE,
      );
    }

    solveEqualityRow(
      bodyA,
      bodyB,
      joint,
      3,
      state,
      HINGE_LOCK_ROW0,
      state[HINGE_LOCK_MASS0],
      state[HINGE_LOCK_ERROR0],
      state[HINGE_LOCK_BIAS],
    );
    solveEqualityRow(
      bodyA,
      bodyB,
      joint,
      4,
      state,
      HINGE_LOCK_ROW1,
      state[HINGE_LOCK_MASS1],
      state[HINGE_LOCK_ERROR1],
      state[HINGE_LOCK_BIAS],
    );
    solvePointBlock(bodyA, bodyB, joint, state);
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const hinge = joint as Physics3DHingeJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    warmStartPointBlock(bodyA, bodyB, joint);
    applyRow(bodyA, bodyB, state, HINGE_LOCK_ROW0, joint.impulse3);
    applyRow(bodyA, bodyB, state, HINGE_LOCK_ROW1, joint.impulse4);
    // Gated on the CURRENT `enableMotor`, not on the value being non-zero. A cached impulse is valid only
    // while the thing that produced it is still running: `solve` skips a disabled motor, so reapplying its
    // last impulse here would exert a torque no solver ever asks for and nothing ever cancels — a disabled
    // motor that keeps turning the hinge forever.
    if (hinge.enableMotor) applyRow(bodyA, bodyB, state, HINGE_AXIS_ROW, hinge.motorImpulse);
  },
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

function dot(a: readonly number[], aOffset: number, b: readonly number[], bOffset: number): number {
  return a[aOffset] * b[bOffset] + a[aOffset + 1] * b[bOffset + 1] + a[aOffset + 2] * b[bOffset + 2];
}

// The signed angle from frame A's Y axis to frame B's, measured about frame A's X axis. Exact for any pose,
// which is why the limits read this rather than the axis component of the rotation error: that component is
// the true angle only while the two lock rows are converged, so a hinge under load would find its stops
// drifting with how hard it was being pushed.
function getSignedAxisAngle(basisA: readonly number[], basisB: readonly number[]): number {
  const crossX = basisA[4] * basisB[5] - basisA[5] * basisB[4];
  const crossY = basisA[5] * basisB[3] - basisA[3] * basisB[5];
  const crossZ = basisA[3] * basisB[4] - basisA[4] * basisB[3];
  const sine = crossX * basisA[0] + crossY * basisA[1] + crossZ * basisA[2];
  return Math.atan2(sine, dot(basisA, 3, basisB, 3));
}

const BAUMGARTE = 0.2;

const FIXED_ANGULAR_MASS = POINT_LENGTH;
const FIXED_ANGULAR_BIAS = FIXED_ANGULAR_MASS + 6;
const FIXED_LENGTH = FIXED_ANGULAR_BIAS + 3;

const HINGE_AXIS_ROW = POINT_LENGTH;
const HINGE_LOCK_ROW0 = HINGE_AXIS_ROW + ROW_LENGTH;
const HINGE_LOCK_ROW1 = HINGE_LOCK_ROW0 + ROW_LENGTH;
const HINGE_AXIS_MASS = HINGE_LOCK_ROW1 + ROW_LENGTH;
const HINGE_LOCK_MASS0 = HINGE_AXIS_MASS + 1;
const HINGE_LOCK_MASS1 = HINGE_LOCK_MASS0 + 1;
const HINGE_LOCK_ERROR0 = HINGE_LOCK_MASS1 + 1;
const HINGE_LOCK_ERROR1 = HINGE_LOCK_ERROR0 + 1;
const HINGE_ANGLE = HINGE_LOCK_ERROR1 + 1;
const HINGE_LOCK_BIAS = HINGE_ANGLE + 1;
const HINGE_LIMIT_BIAS = HINGE_LOCK_BIAS + 1;
const HINGE_MAX_MOTOR = HINGE_LIMIT_BIAS + 1;
const HINGE_LOWER_IMPULSE = HINGE_MAX_MOTOR + 1;
const HINGE_UPPER_IMPULSE = HINGE_LOWER_IMPULSE + 1;
const HINGE_LENGTH = HINGE_UPPER_IMPULSE + 1;

const rotationError = [0, 0, 0];
