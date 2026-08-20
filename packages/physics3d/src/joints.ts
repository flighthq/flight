import type {
  Physics3DConeTwistJoint,
  Physics3DFixedJoint,
  Physics3DGeneric6DofJoint,
  Physics3DHingeJoint,
  Physics3DJoint,
  Physics3DJointSolver,
  Physics3DSliderJoint,
  Physics3DWorld,
} from '@flighthq/types/contract';

import {
  swapPhysics3DJointFrames,
  writePhysics3DJointAnchors,
  writePhysics3DJointRelativeRotation,
  writePhysics3DJointRotationError,
  writePhysics3DJointSeparation,
} from './jointMath';
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
  readJointImpulse,
  warmStartAngularBlock,
  warmStartPointBlock,
  writeAngularRow,
  writeRow,
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

// Pins two anchors together and bounds relative rotation as a cone plus a twist — the ragdoll joint.
//
// The point block, one swing limit, and a pair of twist limits. The swing limit is a single one-sided row
// about the axis the tilt is happening in, not two per-axis bounds: a cone is not a box, and a shoulder
// bounded by three independent intervals reaches poses along the diagonal that the anatomy does not have.
export const physics3DConeTwistJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
  },

  // Vetoed, and the reason is exact rather than cautious. A kind may exchange its ends only when its own
  // constraint keeps the two frames aligned on the axes its parameters are measured against — a hinge and a
  // slider both lock frame B's X onto frame A's, so their axis survives the exchange. A cone-twist
  // deliberately leaves that alignment FREE within the cone, so after the exchange the cone would be
  // measured against the other body's frame: a different constraint wearing the same numbers.
  swapEnds(): boolean {
    return false;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const cone = joint as Physics3DConeTwistJoint;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }

    const state = beginJointSolve(joint, CONE_LENGTH);
    preparePointBlock(bodyA, bodyB, joint, state, dt);
    readFrameRotations(bodyA, bodyB, cone);
    readFrameBases(bodyA, bodyB, cone);

    // The swing axis is perpendicular to both twist axes, so turning B about it is exactly what opens and
    // closes the cone. It vanishes when the two are parallel, which is the joint sitting at the centre of its
    // cone — no direction to limit, and nothing to limit it against.
    const swingX = frameABasis[1] * frameBBasis[2] - frameABasis[2] * frameBBasis[1];
    const swingY = frameABasis[2] * frameBBasis[0] - frameABasis[0] * frameBBasis[2];
    const swingZ = frameABasis[0] * frameBBasis[1] - frameABasis[1] * frameBBasis[0];
    const swingLength = Math.sqrt(swingX * swingX + swingY * swingY + swingZ * swingZ);
    const active = swingLength > AXIS_EPSILON;
    state[CONE_SWING_ACTIVE] = active ? 1 : 0;
    if (active) {
      writeAngularRow(state, CONE_SWING_ROW, swingX / swingLength, swingY / swingLength, swingZ / swingLength);
      state[CONE_SWING_MASS] = getRowMass(bodyA, bodyB, state, CONE_SWING_ROW);
      const swing = Math.acos(clamp(dot(frameABasis, 0, frameBBasis, 0), -1, 1));
      state[CONE_SWING_ERROR] = getConeSwingLimit(cone) - swing;
    }

    writeAngularRow(state, CONE_TWIST_ROW, frameABasis[0], frameABasis[1], frameABasis[2]);
    state[CONE_TWIST_MASS] = getRowMass(bodyA, bodyB, state, CONE_TWIST_ROW);
    // Twist is the X component of the relative rotation taken in A's own frame — the rotation left over once
    // the swing is removed. Reading it here rather than from the world-space error vector is what keeps it
    // independent of how far the joint has swung.
    writePhysics3DJointRelativeRotation(
      frameARotation[0],
      frameARotation[1],
      frameARotation[2],
      frameARotation[3],
      frameBRotation[0],
      frameBRotation[1],
      frameBRotation[2],
      frameBRotation[3],
      relativeRotation,
    );
    state[CONE_TWIST_ANGLE] = 2 * Math.atan2(relativeRotation[0], relativeRotation[3]);

    state[CONE_LIMIT_BIAS] = 1 / dt;
    state[CONE_SWING_IMPULSE] = 0;
    state[CONE_LOWER_TWIST_IMPULSE] = 0;
    state[CONE_UPPER_TWIST_IMPULSE] = 0;
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const cone = joint as Physics3DConeTwistJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    if (cone.enableSwingLimit && state[CONE_SWING_ACTIVE] === 1 && state[CONE_SWING_MASS] > 0) {
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        CONE_SWING_ROW,
        state[CONE_SWING_MASS],
        state[CONE_SWING_ERROR],
        state[CONE_LIMIT_BIAS],
        CONE_SWING_IMPULSE,
      );
    }

    if (cone.enableTwistLimit && state[CONE_TWIST_MASS] > 0) {
      const twist = state[CONE_TWIST_ANGLE];
      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        CONE_TWIST_ROW,
        state[CONE_TWIST_MASS],
        twist - cone.lowerTwistAngle,
        state[CONE_LIMIT_BIAS],
        CONE_LOWER_TWIST_IMPULSE,
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        CONE_TWIST_ROW,
        state[CONE_TWIST_MASS],
        cone.upperTwistAngle - twist,
        state[CONE_LIMIT_BIAS],
        CONE_UPPER_TWIST_IMPULSE,
      );
    }

    solvePointBlock(bodyA, bodyB, joint, state);
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    warmStartPointBlock(bodyA, bodyB, joint);
  },
};

// Bounds each of the six degrees of freedom independently — the configurable joint every other kind is a
// preset of.
//
// Each axis reads its state from its bounds rather than from a mode flag: `lower > upper` is free,
// `lower === upper` is locked, and anything else is limited. A separate flag would be a second source that
// can disagree with the numbers it describes.
export const physics3DGeneric6DofJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    joint.impulse3 = 0;
    joint.impulse4 = 0;
    joint.impulse5 = 0;
  },

  // Vetoed for the same reason as a cone-twist, and for a kind whose entire purpose is per-axis freedom the
  // reason is unavoidable: any axis left free lets the two frames diverge about it, so the bounds — which are
  // measured against frame A — would after the exchange be measured against a frame the joint never held
  // still. An all-locked 6-DOF could be exchanged safely, but a kind cannot answer this per instance without
  // its ends already meaning two different things depending on how it was configured.
  swapEnds(): boolean {
    return false;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const dof = joint as Physics3DGeneric6DofJoint;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }

    const state = beginJointSolve(joint, DOF_LENGTH);
    writePhysics3DJointAnchors(bodyA, bodyB, joint);
    writePhysics3DJointSeparation(bodyA, bodyB, joint, separation);
    readFrameRotations(bodyA, bodyB, dof);
    readFrameBases(bodyA, bodyB, dof);
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
    readDofBounds(dof);

    for (let axis = 0; axis < 6; axis += 1) {
      const rowOffset = DOF_ROWS + axis * ROW_LENGTH;
      const basisOffset = (axis % 3) * 3;
      const lower = dofLower[axis];
      const upper = dofUpper[axis];
      state[DOF_MODE + axis] = lower > upper ? DOF_FREE : lower === upper ? DOF_LOCKED : DOF_LIMITED;
      state[DOF_LOWER_IMPULSE + axis] = 0;
      state[DOF_UPPER_IMPULSE + axis] = 0;
      if (state[DOF_MODE + axis] === DOF_FREE) continue;

      if (axis < 3) {
        writeLinearAxisRow(state, rowOffset, joint, basisOffset);
        state[DOF_VALUE + axis] = dot(separation, 0, frameABasis, basisOffset);
      } else {
        writeAngularRow(
          state,
          rowOffset,
          frameABasis[basisOffset],
          frameABasis[basisOffset + 1],
          frameABasis[basisOffset + 2],
        );
        state[DOF_VALUE + axis] = dot(rotationError, 0, frameABasis, basisOffset);
      }
      state[DOF_MASS + axis] = getRowMass(bodyA, bodyB, state, rowOffset);
    }

    state[DOF_LOCK_BIAS] = BAUMGARTE / dt;
    state[DOF_LIMIT_BIAS] = 1 / dt;
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const dof = joint as Physics3DGeneric6DofJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    readDofBounds(dof);

    for (let axis = 0; axis < 6; axis += 1) {
      const mode = state[DOF_MODE + axis];
      if (mode === DOF_FREE || state[DOF_MASS + axis] <= 0) continue;
      const rowOffset = DOF_ROWS + axis * ROW_LENGTH;
      const value = state[DOF_VALUE + axis];

      if (mode === DOF_LOCKED) {
        solveEqualityRow(
          bodyA,
          bodyB,
          joint,
          axis,
          state,
          rowOffset,
          state[DOF_MASS + axis],
          value - dofLower[axis],
          state[DOF_LOCK_BIAS],
        );
        continue;
      }

      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        rowOffset,
        state[DOF_MASS + axis],
        value - dofLower[axis],
        state[DOF_LIMIT_BIAS],
        DOF_LOWER_IMPULSE + axis,
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        rowOffset,
        state[DOF_MASS + axis],
        dofUpper[axis] - value,
        state[DOF_LIMIT_BIAS],
        DOF_UPPER_IMPULSE + axis,
      );
    }
  },

  // Only the locked axes are warm-started. A limited axis accumulates within the step and starts the next one
  // cold, so there is no accumulator here to reapply — reapplying the locked block's slot for it would push
  // against a bound the joint may no longer be anywhere near.
  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    for (let axis = 0; axis < 6; axis += 1) {
      if (state[DOF_MODE + axis] !== DOF_LOCKED) continue;
      applyRow(bodyA, bodyB, state, DOF_ROWS + axis * ROW_LENGTH, readJointImpulse(joint, axis));
    }
  },
};

// Confines relative motion to translation along the frame's X axis, optionally motorized and travel-limited.
//
// Two perpendicular linear rows hold the anchors on the rail, three angular rows lock the orientation, and
// the axis row carries the motor and the limits. The two perpendicular rows are solved sequentially rather
// than as a coupled 2x2: their linear directions are orthogonal, so they couple only through an anisotropic
// inertia tensor, and the residual is what the remaining velocity iterations absorb.
export const physics3DSliderJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse3 = 0;
    joint.impulse4 = 0;
    joint.impulse5 = 0;
    (joint as Physics3DSliderJoint).motorImpulse = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const slider = joint as Physics3DSliderJoint;
    slider.motorImpulse = (slider.motorImpulse ?? 0) * timestepRatio;
  },

  // The translation is measured from A's anchor to B's along the shared axis, so exchanging the ends reverses
  // it: the interval negates AND its ends exchange, and the motor's target velocity reverses with them. The
  // exchange is exact because the slider's own angular lock holds frame B's X onto frame A's, so the axis the
  // bounds are measured against is the same line from either end.
  swapEnds(joint: Physics3DJoint): boolean {
    const slider = joint as Physics3DSliderJoint;
    swapPhysics3DJointFrames(slider);
    const lower = slider.lowerTranslation;
    slider.lowerTranslation = -slider.upperTranslation;
    slider.upperTranslation = -lower;
    slider.motorSpeed = -slider.motorSpeed;
    slider.motorImpulse = -(slider.motorImpulse ?? 0);
    return true;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const slider = joint as Physics3DSliderJoint;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }

    const state = beginJointSolve(joint, SLIDER_LENGTH);
    writePhysics3DJointAnchors(bodyA, bodyB, joint);
    writePhysics3DJointSeparation(bodyA, bodyB, joint, separation);
    readFrameRotations(bodyA, bodyB, slider);
    readFrameBases(bodyA, bodyB, slider);

    writeLinearAxisRow(state, SLIDER_AXIS_ROW, joint, 0);
    writeLinearAxisRow(state, SLIDER_PERP_ROW0, joint, 3);
    writeLinearAxisRow(state, SLIDER_PERP_ROW1, joint, 6);
    state[SLIDER_AXIS_MASS] = getRowMass(bodyA, bodyB, state, SLIDER_AXIS_ROW);
    state[SLIDER_PERP_MASS0] = getRowMass(bodyA, bodyB, state, SLIDER_PERP_ROW0);
    state[SLIDER_PERP_MASS1] = getRowMass(bodyA, bodyB, state, SLIDER_PERP_ROW1);
    state[SLIDER_TRANSLATION] = dot(separation, 0, frameABasis, 0);
    state[SLIDER_PERP_ERROR0] = dot(separation, 0, frameABasis, 3);
    state[SLIDER_PERP_ERROR1] = dot(separation, 0, frameABasis, 6);

    prepareAngularBlock(bodyA, bodyB, state, SLIDER_ANGULAR_MASS, SLIDER_ANGULAR_BIAS, dt);

    state[SLIDER_LOCK_BIAS] = BAUMGARTE / dt;
    state[SLIDER_LIMIT_BIAS] = 1 / dt;
    state[SLIDER_MAX_MOTOR] = Math.max(0, dt * slider.maxMotorForce);
    state[SLIDER_LOWER_IMPULSE] = 0;
    state[SLIDER_UPPER_IMPULSE] = 0;

    slider.motorImpulse ??= 0;
    if (slider.enableMotor) {
      slider.motorImpulse = clamp(slider.motorImpulse, -state[SLIDER_MAX_MOTOR], state[SLIDER_MAX_MOTOR]);
    } else {
      slider.motorImpulse = 0;
    }
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const slider = joint as Physics3DSliderJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    if (slider.enableMotor && state[SLIDER_AXIS_MASS] > 0) {
      slider.motorImpulse = solveMotorRow(
        bodyA,
        bodyB,
        state,
        SLIDER_AXIS_ROW,
        state[SLIDER_AXIS_MASS],
        slider.motorSpeed,
        state[SLIDER_MAX_MOTOR],
        slider.motorImpulse,
      );
    }

    if (slider.enableLimit && state[SLIDER_AXIS_MASS] > 0) {
      const translation = state[SLIDER_TRANSLATION];
      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        SLIDER_AXIS_ROW,
        state[SLIDER_AXIS_MASS],
        translation - slider.lowerTranslation,
        state[SLIDER_LIMIT_BIAS],
        SLIDER_LOWER_IMPULSE,
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        SLIDER_AXIS_ROW,
        state[SLIDER_AXIS_MASS],
        slider.upperTranslation - translation,
        state[SLIDER_LIMIT_BIAS],
        SLIDER_UPPER_IMPULSE,
      );
    }

    solveAngularBlock(bodyA, bodyB, joint, state, SLIDER_ANGULAR_MASS, SLIDER_ANGULAR_BIAS);
    solveEqualityRow(
      bodyA,
      bodyB,
      joint,
      0,
      state,
      SLIDER_PERP_ROW0,
      state[SLIDER_PERP_MASS0],
      state[SLIDER_PERP_ERROR0],
      state[SLIDER_LOCK_BIAS],
    );
    solveEqualityRow(
      bodyA,
      bodyB,
      joint,
      1,
      state,
      SLIDER_PERP_ROW1,
      state[SLIDER_PERP_MASS1],
      state[SLIDER_PERP_ERROR1],
      state[SLIDER_LOCK_BIAS],
    );
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const slider = joint as Physics3DSliderJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    warmStartAngularBlock(bodyA, bodyB, joint);
    applyRow(bodyA, bodyB, state, SLIDER_PERP_ROW0, joint.impulse0);
    applyRow(bodyA, bodyB, state, SLIDER_PERP_ROW1, joint.impulse1);
    if (slider.enableMotor) applyRow(bodyA, bodyB, state, SLIDER_AXIS_ROW, slider.motorImpulse);
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

// The effective cone half-angle in the direction the twist axis has actually tilted. Equal limits give a
// circular cone; unequal ones give an ellipse, and the blend below is the ellipse in polar form — it returns
// `swingLimitY` for a tilt straight toward frame A's Y and `swingLimitZ` for one straight toward Z.
//
// A non-positive limit is a cone with no opening, and the smaller of the two is the honest reading of it: an
// ellipse with a zero semi-axis is a line segment, not an ellipse.
function getConeSwingLimit(cone: Readonly<Physics3DConeTwistJoint>): number {
  if (cone.swingLimitY <= 0 || cone.swingLimitZ <= 0) return Math.min(cone.swingLimitY, cone.swingLimitZ);
  const towardY = dot(frameBBasis, 0, frameABasis, 3);
  const towardZ = dot(frameBBasis, 0, frameABasis, 6);
  const tilt = Math.sqrt(towardY * towardY + towardZ * towardZ);
  if (tilt <= AXIS_EPSILON) return Math.min(cone.swingLimitY, cone.swingLimitZ);
  const unitY = towardY / tilt / cone.swingLimitY;
  const unitZ = towardZ / tilt / cone.swingLimitZ;
  return 1 / Math.sqrt(unitY * unitY + unitZ * unitZ);
}

// Copies a 6-DOF joint's twelve bounds into the two scratch arrays, ordered linear X, Y, Z then angular X, Y,
// Z — the axis numbering every loop over the six degrees of freedom uses.
function readDofBounds(dof: Readonly<Physics3DGeneric6DofJoint>): void {
  dofLower[0] = dof.lowerLinearX;
  dofLower[1] = dof.lowerLinearY;
  dofLower[2] = dof.lowerLinearZ;
  dofLower[3] = dof.lowerAngularX;
  dofLower[4] = dof.lowerAngularY;
  dofLower[5] = dof.lowerAngularZ;
  dofUpper[0] = dof.upperLinearX;
  dofUpper[1] = dof.upperLinearY;
  dofUpper[2] = dof.upperLinearZ;
  dofUpper[3] = dof.upperAngularX;
  dofUpper[4] = dof.upperAngularY;
  dofUpper[5] = dof.upperAngularZ;
}

// Writes the row for a linear coordinate measured along one of frame A's axes, reading the separation left by
// `writePhysics3DJointSeparation`.
//
// A's arm is `(rA + separation) x direction`, NOT `rA x direction`. The direction is carried by A and rotates
// with it, so the coordinate changes when A turns even if neither anchor moves; an arm taken from A's bare
// lever arm drops that term and leaks motion sideways whenever the rail body rotates.
function writeLinearAxisRow(
  state: number[],
  offset: number,
  joint: Readonly<Physics3DJoint>,
  basisOffset: number,
): void {
  const directionX = frameABasis[basisOffset];
  const directionY = frameABasis[basisOffset + 1];
  const directionZ = frameABasis[basisOffset + 2];
  const armAX = joint.rAX + separation[0];
  const armAY = joint.rAY + separation[1];
  const armAZ = joint.rAZ + separation[2];
  writeRow(
    state,
    offset,
    directionX,
    directionY,
    directionZ,
    armAY * directionZ - armAZ * directionY,
    armAZ * directionX - armAX * directionZ,
    armAX * directionY - armAY * directionX,
    joint.rBY * directionZ - joint.rBZ * directionY,
    joint.rBZ * directionX - joint.rBX * directionZ,
    joint.rBX * directionY - joint.rBY * directionX,
  );
}

// Below this the swing axis is degenerate: the two twist axes are parallel, the joint sits at the centre of
// its cone, and there is no direction for a limit to act along.
const AXIS_EPSILON = 1e-9;

const CONE_SWING_ROW = POINT_LENGTH;
const CONE_TWIST_ROW = CONE_SWING_ROW + ROW_LENGTH;
const CONE_SWING_MASS = CONE_TWIST_ROW + ROW_LENGTH;
const CONE_SWING_ERROR = CONE_SWING_MASS + 1;
const CONE_SWING_ACTIVE = CONE_SWING_ERROR + 1;
const CONE_TWIST_MASS = CONE_SWING_ACTIVE + 1;
const CONE_TWIST_ANGLE = CONE_TWIST_MASS + 1;
const CONE_LIMIT_BIAS = CONE_TWIST_ANGLE + 1;
const CONE_SWING_IMPULSE = CONE_LIMIT_BIAS + 1;
const CONE_LOWER_TWIST_IMPULSE = CONE_SWING_IMPULSE + 1;
const CONE_UPPER_TWIST_IMPULSE = CONE_LOWER_TWIST_IMPULSE + 1;
const CONE_LENGTH = CONE_UPPER_TWIST_IMPULSE + 1;

const DOF_FREE = 0;
const DOF_LOCKED = 1;
const DOF_LIMITED = 2;
const DOF_ROWS = 0;
const DOF_MASS = DOF_ROWS + 6 * ROW_LENGTH;
const DOF_VALUE = DOF_MASS + 6;
const DOF_MODE = DOF_VALUE + 6;
const DOF_LOWER_IMPULSE = DOF_MODE + 6;
const DOF_UPPER_IMPULSE = DOF_LOWER_IMPULSE + 6;
const DOF_LOCK_BIAS = DOF_UPPER_IMPULSE + 6;
const DOF_LIMIT_BIAS = DOF_LOCK_BIAS + 1;
const DOF_LENGTH = DOF_LIMIT_BIAS + 1;

const SLIDER_PERP_ROW0 = 0;
const SLIDER_PERP_ROW1 = SLIDER_PERP_ROW0 + ROW_LENGTH;
const SLIDER_AXIS_ROW = SLIDER_PERP_ROW1 + ROW_LENGTH;
const SLIDER_ANGULAR_MASS = SLIDER_AXIS_ROW + ROW_LENGTH;
const SLIDER_ANGULAR_BIAS = SLIDER_ANGULAR_MASS + 6;
const SLIDER_PERP_MASS0 = SLIDER_ANGULAR_BIAS + 3;
const SLIDER_PERP_MASS1 = SLIDER_PERP_MASS0 + 1;
const SLIDER_PERP_ERROR0 = SLIDER_PERP_MASS1 + 1;
const SLIDER_PERP_ERROR1 = SLIDER_PERP_ERROR0 + 1;
const SLIDER_AXIS_MASS = SLIDER_PERP_ERROR1 + 1;
const SLIDER_TRANSLATION = SLIDER_AXIS_MASS + 1;
const SLIDER_LOCK_BIAS = SLIDER_TRANSLATION + 1;
const SLIDER_LIMIT_BIAS = SLIDER_LOCK_BIAS + 1;
const SLIDER_MAX_MOTOR = SLIDER_LIMIT_BIAS + 1;
const SLIDER_LOWER_IMPULSE = SLIDER_MAX_MOTOR + 1;
const SLIDER_UPPER_IMPULSE = SLIDER_LOWER_IMPULSE + 1;
const SLIDER_LENGTH = SLIDER_UPPER_IMPULSE + 1;

const dofLower = [0, 0, 0, 0, 0, 0];
const dofUpper = [0, 0, 0, 0, 0, 0];
const relativeRotation = [0, 0, 0, 1];
const rotationError = [0, 0, 0];
const separation = [0, 0, 0];
