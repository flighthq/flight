import type {
  Physics3DConeTwistJoint,
  Physics3DDistanceJoint,
  Physics3DFixedJoint,
  Physics3DGeneric6DofJoint,
  Physics3DHingeJoint,
  Physics3DJoint,
  Physics3DJointReaction,
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
import { accumulatePhysics3DJointRowReaction, clearPhysics3DJointReaction } from './jointReaction';
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
  getRowVelocity,
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
  writePhysics3DSoftRowParameters,
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
export const Physics3DDistanceJointKind = 'Distance';
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

  // A point block's three rows ARE the world axes acting at the anchor, so its accumulators are already
  // the world-space linear impulse and no row arithmetic is needed. It reports no torque because it
  // constrains no rotation — a zero here is a measurement, not a gap.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    if (getJointSolveState(joint) === undefined) return false;
    clearPhysics3DJointReaction(out);
    writePointBlockForce(joint, inverseDt, out);
    return true;
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

// Holds two anchors apart along the line joining them. ONE row rather than the point block's three: the
// separation is a single scalar coordinate, and constraining the other two axes is what makes a joint a
// ball-and-socket instead.
//
// Up to three rows may be live at once — a rest-length row and the two one-sided limits — and they read
// DIFFERENT effective masses on purpose. The rest row's mass is softened by the spring's compliance so the
// spring can yield; a limit is a hard stop and reads the unsoftened mass, or a stiff spring would let the
// cable stretch straight through the bound it exists to enforce.
export const physics3DDistanceJointSolver: Physics3DJointSolver = {
  clearAccumulatedImpulses(joint: Physics3DJoint): void {
    joint.impulse0 = 0;
    const distance = joint as Physics3DDistanceJoint;
    distance.lowerLimitImpulse = 0;
    distance.upperLimitImpulse = 0;
  },

  prepare(world: Physics3DWorld, joint: Physics3DJoint, dt: number): void {
    const distance = joint as Physics3DDistanceJoint;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) {
      clearJointSolve(joint);
      return;
    }

    const state = beginJointSolve(joint, DISTANCE_LENGTH);
    writePhysics3DJointAnchors(bodyA, bodyB, joint);
    writePhysics3DJointSeparation(bodyA, bodyB, joint, distanceAxis);

    const separation = Math.sqrt(
      distanceAxis[0] * distanceAxis[0] + distanceAxis[1] * distanceAxis[1] + distanceAxis[2] * distanceAxis[2],
    );
    // Coincident anchors leave the axis undefined — every direction is equally the line between them. Any
    // fixed unit vector is a defensible reading and none is more correct; picking one keeps the row finite,
    // where normalizing by zero would put NaN into both bodies and never leave.
    const axisX = separation > AXIS_EPSILON ? distanceAxis[0] / separation : 1;
    const axisY = separation > AXIS_EPSILON ? distanceAxis[1] / separation : 0;
    const axisZ = separation > AXIS_EPSILON ? distanceAxis[2] / separation : 0;

    // The angular arms are the CROSS products of each lever arm with the axis, not the lever arms
    // themselves: a row's arm is what the inverse inertia tensor is applied to, and the torque an axial
    // impulse exerts about the centre of mass is `r x axis`.
    writeRow(
      state,
      DISTANCE_ROW,
      axisX,
      axisY,
      axisZ,
      joint.rAY * axisZ - joint.rAZ * axisY,
      joint.rAZ * axisX - joint.rAX * axisZ,
      joint.rAX * axisY - joint.rAY * axisX,
      joint.rBY * axisZ - joint.rBZ * axisY,
      joint.rBZ * axisX - joint.rBX * axisZ,
      joint.rBX * axisY - joint.rBY * axisX,
    );

    const mass = getRowMass(bodyA, bodyB, state, DISTANCE_ROW);
    state[DISTANCE_SEPARATION] = separation;
    state[DISTANCE_LIMIT_MASS] = mass;
    state[DISTANCE_LIMIT_BIAS] = 1 / dt;

    // The rest-length row yields to the limits when the spring is off, because a fixed length and a slack
    // interval cannot both hold on one axis. With the spring on, both are live and the interval bounds it.
    const restActive = distance.enableSpring || !distance.enableLimit;
    state[DISTANCE_REST_ACTIVE] = restActive ? 1 : 0;
    const error = separation - distance.length;

    if (restActive && distance.enableSpring) {
      // The rest row's hard fallback is `BAUMGARTE / dt`, not the `1 / dt` its LIMIT rows use: this row is
      // two-sided and corrects gently, where a one-sided stop corrects fully.
      writePhysics3DSoftRowParameters(
        mass,
        distance.frequencyHz,
        distance.dampingRatio,
        dt,
        BAUMGARTE / dt,
        softRowScratch,
      );
      state[DISTANCE_MASS] = softRowScratch[0];
      state[DISTANCE_BIAS] = error * softRowScratch[1];
      state[DISTANCE_GAMMA] = softRowScratch[2];
    } else {
      state[DISTANCE_GAMMA] = 0;
      state[DISTANCE_BIAS] = error * (BAUMGARTE / dt);
      state[DISTANCE_MASS] = mass;
    }

    distance.lowerLimitImpulse ??= 0;
    distance.upperLimitImpulse ??= 0;
    if (!distance.enableLimit) {
      distance.lowerLimitImpulse = 0;
      distance.upperLimitImpulse = 0;
    }
    state[DISTANCE_LOWER_IMPULSE] = distance.lowerLimitImpulse;
    state[DISTANCE_UPPER_IMPULSE] = distance.upperLimitImpulse;
  },

  solve(world: Physics3DWorld, joint: Physics3DJoint): void {
    const distance = joint as Physics3DDistanceJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    if (state[DISTANCE_REST_ACTIVE] === 1) {
      // The gamma term is the whole of the softness, and it multiplies the ACCUMULATED impulse rather than
      // this iteration's. A soft constraint is one that gives way in proportion to how hard it has already
      // been pushing, which is a statement about the total, not the increment.
      const velocity = getRowVelocity(bodyA, bodyB, state, DISTANCE_ROW);
      const impulse =
        -state[DISTANCE_MASS] * (velocity + state[DISTANCE_BIAS] + state[DISTANCE_GAMMA] * joint.impulse0);
      joint.impulse0 += impulse;
      applyRow(bodyA, bodyB, state, DISTANCE_ROW, impulse);
    }

    if (distance.enableLimit) {
      const separation = state[DISTANCE_SEPARATION];
      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        DISTANCE_ROW,
        state[DISTANCE_LIMIT_MASS],
        separation - distance.minLength,
        state[DISTANCE_LIMIT_BIAS],
        DISTANCE_LOWER_IMPULSE,
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        DISTANCE_ROW,
        state[DISTANCE_LIMIT_MASS],
        distance.maxLength - separation,
        state[DISTANCE_LIMIT_BIAS],
        DISTANCE_UPPER_IMPULSE,
      );
      distance.lowerLimitImpulse = state[DISTANCE_LOWER_IMPULSE];
      distance.upperLimitImpulse = state[DISTANCE_UPPER_IMPULSE];
    }
  },

  // One axial row carrying up to three accumulators, which sum because they act along the SAME direction:
  // the rest-length impulse and the two one-sided limits are all pushes or pulls on the one axis.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    const distance = joint as Physics3DDistanceJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return false;
    clearPhysics3DJointReaction(out);
    let axial = state[DISTANCE_REST_ACTIVE] === 1 ? joint.impulse0 : 0;
    if (distance.enableLimit) axial += (distance.lowerLimitImpulse ?? 0) - (distance.upperLimitImpulse ?? 0);
    accumulatePhysics3DJointRowReaction(joint, state, DISTANCE_ROW, axial * inverseDt, out);
    return true;
  },

  // Nothing to reverse. Every quantity this kind carries is an unsigned scalar along a line, and a line has
  // the same length read from either end — unlike a hinge's angles, which are positions on an axis that
  // reverses with the ends. The two limit accumulators are magnitudes of "push apart" and "pull together",
  // and those keep their meaning too, because the row's direction flips with them.
  swapEnds(): boolean {
    return true;
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const distance = joint as Physics3DDistanceJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    if (state[DISTANCE_REST_ACTIVE] === 1) applyRow(bodyA, bodyB, state, DISTANCE_ROW, joint.impulse0);
    if (distance.enableLimit) {
      applyRow(bodyA, bodyB, state, DISTANCE_ROW, distance.lowerLimitImpulse - distance.upperLimitImpulse);
    }
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

  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    if (getJointSolveState(joint) === undefined) return false;
    clearPhysics3DJointReaction(out);
    writePointBlockForce(joint, inverseDt, out);
    writeAngularBlockTorque(joint, inverseDt, out);
    return true;
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
    const hinge = joint as Physics3DHingeJoint;
    hinge.motorImpulse = 0;
    hinge.lowerLimitImpulse = 0;
    hinge.upperLimitImpulse = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const hinge = joint as Physics3DHingeJoint;
    hinge.motorImpulse = (hinge.motorImpulse ?? 0) * timestepRatio;
    hinge.lowerLimitImpulse = (hinge.lowerLimitImpulse ?? 0) * timestepRatio;
    hinge.upperLimitImpulse = (hinge.upperLimitImpulse ?? 0) * timestepRatio;
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
    // Exchanged, NOT negated. Each is a non-negative magnitude whose direction is carried by the row that
    // owns it, so the push that used to hold the lower bound is the one that now holds the upper.
    const lowerImpulse = hinge.lowerLimitImpulse ?? 0;
    hinge.lowerLimitImpulse = hinge.upperLimitImpulse ?? 0;
    hinge.upperLimitImpulse = lowerImpulse;
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
    writeLimitRowParameters(
      state,
      HINGE_LIMIT_MASS,
      HINGE_LIMIT_GAMMA,
      HINGE_LIMIT_BIAS,
      state[HINGE_AXIS_MASS],
      hinge.enableLimitSpring,
      hinge.limitFrequencyHz,
      hinge.limitDampingRatio,
      dt,
    );
    state[HINGE_MAX_MOTOR] = Math.max(0, dt * hinge.maxMotorTorque);
    // Seeded from the carried accumulators rather than zeroed, which is what makes the limit rows warm
    // start. Gated on the CURRENT `enableLimit` for the same reason the motor is: a cached impulse is only
    // valid while the row that produced it is still being solved.
    hinge.lowerLimitImpulse ??= 0;
    hinge.upperLimitImpulse ??= 0;
    if (!hinge.enableLimit) {
      hinge.lowerLimitImpulse = 0;
      hinge.upperLimitImpulse = 0;
    }
    state[HINGE_LOWER_IMPULSE] = hinge.lowerLimitImpulse;
    state[HINGE_UPPER_IMPULSE] = hinge.upperLimitImpulse;

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
        state[HINGE_LIMIT_MASS],
        angle - hinge.lowerAngle,
        state[HINGE_LIMIT_BIAS],
        HINGE_LOWER_IMPULSE,
        state[HINGE_LIMIT_GAMMA],
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        HINGE_AXIS_ROW,
        state[HINGE_LIMIT_MASS],
        hinge.upperAngle - angle,
        state[HINGE_LIMIT_BIAS],
        HINGE_UPPER_IMPULSE,
        state[HINGE_LIMIT_GAMMA],
      );
      // Written back every iteration, not once at the end of the step: the solve state is per-sub-interval
      // scratch that `beginJointSolve` reallocates, so the joint field is the only place a value survives to
      // the next one.
      hinge.lowerLimitImpulse = state[HINGE_LOWER_IMPULSE];
      hinge.upperLimitImpulse = state[HINGE_UPPER_IMPULSE];
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

  // Two lock rows plus the axis row, each read against the accumulator its own `warmStart` reapplies.
  // The motor and the limits share the axis row and therefore add: both are torques about the hinge.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    const hinge = joint as Physics3DHingeJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return false;
    clearPhysics3DJointReaction(out);
    writePointBlockForce(joint, inverseDt, out);
    accumulatePhysics3DJointRowReaction(joint, state, HINGE_LOCK_ROW0, joint.impulse3 * inverseDt, out);
    accumulatePhysics3DJointRowReaction(joint, state, HINGE_LOCK_ROW1, joint.impulse4 * inverseDt, out);
    let axial = hinge.enableMotor ? (hinge.motorImpulse ?? 0) : 0;
    if (hinge.enableLimit) axial += (hinge.lowerLimitImpulse ?? 0) - (hinge.upperLimitImpulse ?? 0);
    accumulatePhysics3DJointRowReaction(joint, state, HINGE_AXIS_ROW, axial * inverseDt, out);
    return true;
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
    // The lower row pushes along the axis and the upper row against it, which is the sign each carries in
    // `solveLowerLimitRow`/`solveUpperLimitRow`. Reapplying them with the wrong signs would drive the joint
    // toward the stop it is resting against instead of holding it off.
    if (hinge.enableLimit) {
      applyRow(bodyA, bodyB, state, HINGE_AXIS_ROW, hinge.lowerLimitImpulse - hinge.upperLimitImpulse);
    }
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
    const cone = joint as Physics3DConeTwistJoint;
    cone.swingLimitImpulse = 0;
    cone.lowerTwistImpulse = 0;
    cone.upperTwistImpulse = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const cone = joint as Physics3DConeTwistJoint;
    cone.swingLimitImpulse = (cone.swingLimitImpulse ?? 0) * timestepRatio;
    cone.lowerTwistImpulse = (cone.lowerTwistImpulse ?? 0) * timestepRatio;
    cone.upperTwistImpulse = (cone.upperTwistImpulse ?? 0) * timestepRatio;
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

    writeLimitRowParameters(
      state,
      CONE_SWING_SOFT_MASS,
      CONE_SWING_GAMMA,
      CONE_LIMIT_BIAS,
      state[CONE_SWING_MASS],
      cone.enableLimitSpring,
      cone.limitFrequencyHz,
      cone.limitDampingRatio,
      dt,
    );
    // The twist group writes the SAME bias slot, which is exact rather than a last-write-wins accident:
    // the soft bias factor is mass-independent, so swing and twist agree on it even though their row
    // masses differ. Only the softened mass and gamma need a slot each.
    writeLimitRowParameters(
      state,
      CONE_TWIST_SOFT_MASS,
      CONE_TWIST_GAMMA,
      CONE_LIMIT_BIAS,
      state[CONE_TWIST_MASS],
      cone.enableLimitSpring,
      cone.limitFrequencyHz,
      cone.limitDampingRatio,
      dt,
    );
    // The swing row's AXIS moves with the tilt direction, so its carried impulse is reapplied along a
    // slightly different axis than the one that earned it — the same approximation contact warm starting
    // makes when a normal rotates, and it converges for the same reason: one iteration corrects it.
    cone.swingLimitImpulse ??= 0;
    cone.lowerTwistImpulse ??= 0;
    cone.upperTwistImpulse ??= 0;
    if (!cone.enableSwingLimit) cone.swingLimitImpulse = 0;
    if (!cone.enableTwistLimit) {
      cone.lowerTwistImpulse = 0;
      cone.upperTwistImpulse = 0;
    }
    state[CONE_SWING_IMPULSE] = cone.swingLimitImpulse;
    state[CONE_LOWER_TWIST_IMPULSE] = cone.lowerTwistImpulse;
    state[CONE_UPPER_TWIST_IMPULSE] = cone.upperTwistImpulse;
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
        state[CONE_SWING_SOFT_MASS],
        state[CONE_SWING_ERROR],
        state[CONE_LIMIT_BIAS],
        CONE_SWING_IMPULSE,
        state[CONE_SWING_GAMMA],
      );
      cone.swingLimitImpulse = state[CONE_SWING_IMPULSE];
    }

    if (cone.enableTwistLimit && state[CONE_TWIST_MASS] > 0) {
      const twist = state[CONE_TWIST_ANGLE];
      solveLowerLimitRow(
        bodyA,
        bodyB,
        state,
        CONE_TWIST_ROW,
        state[CONE_TWIST_SOFT_MASS],
        twist - cone.lowerTwistAngle,
        state[CONE_LIMIT_BIAS],
        CONE_LOWER_TWIST_IMPULSE,
        state[CONE_TWIST_GAMMA],
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        CONE_TWIST_ROW,
        state[CONE_TWIST_SOFT_MASS],
        cone.upperTwistAngle - twist,
        state[CONE_LIMIT_BIAS],
        CONE_UPPER_TWIST_IMPULSE,
        state[CONE_TWIST_GAMMA],
      );
      cone.lowerTwistImpulse = state[CONE_LOWER_TWIST_IMPULSE];
      cone.upperTwistImpulse = state[CONE_UPPER_TWIST_IMPULSE];
    }

    solvePointBlock(bodyA, bodyB, joint, state);
  },

  // The swing row is read only while it is the ACTIVE side of the cone, matching `warmStart`: outside
  // that the row was never built this sub-interval and its axis is stale, so reading it would attribute a
  // real load to an arbitrary direction.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    const cone = joint as Physics3DConeTwistJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return false;
    clearPhysics3DJointReaction(out);
    writePointBlockForce(joint, inverseDt, out);
    if (cone.enableSwingLimit && state[CONE_SWING_ACTIVE] === 1) {
      accumulatePhysics3DJointRowReaction(
        joint,
        state,
        CONE_SWING_ROW,
        -(cone.swingLimitImpulse ?? 0) * inverseDt,
        out,
      );
    }
    if (cone.enableTwistLimit) {
      const twist = (cone.lowerTwistImpulse ?? 0) - (cone.upperTwistImpulse ?? 0);
      accumulatePhysics3DJointRowReaction(joint, state, CONE_TWIST_ROW, twist * inverseDt, out);
    }
    return true;
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const cone = joint as Physics3DConeTwistJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    warmStartPointBlock(bodyA, bodyB, joint);
    // The swing row is reapplied only while it is the ACTIVE side of the cone. Outside that, the row it was
    // measured against does not exist this sub-interval and its axis is stale.
    if (cone.enableSwingLimit && state[CONE_SWING_ACTIVE] === 1) {
      applyRow(bodyA, bodyB, state, CONE_SWING_ROW, -cone.swingLimitImpulse);
    }
    if (cone.enableTwistLimit) {
      applyRow(bodyA, bodyB, state, CONE_TWIST_ROW, cone.lowerTwistImpulse - cone.upperTwistImpulse);
    }
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
    const dof = joint as Physics3DGeneric6DofJoint;
    for (let axis = 0; axis < 6; axis += 1) {
      dof.lowerLimitImpulses[axis] = 0;
      dof.upperLimitImpulses[axis] = 0;
    }
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    joint.impulse3 = 0;
    joint.impulse4 = 0;
    joint.impulse5 = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const dof = joint as Physics3DGeneric6DofJoint;
    for (let axis = 0; axis < 6; axis += 1) {
      dof.lowerLimitImpulses[axis] *= timestepRatio;
      dof.upperLimitImpulses[axis] *= timestepRatio;
    }
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
      // Carried only while the axis is still LIMITED. An axis whose bounds changed it to free or locked has
      // an accumulator describing a constraint that no longer exists, and reapplying it would push against a
      // bound the joint may no longer be anywhere near.
      if (state[DOF_MODE + axis] !== DOF_LIMITED) {
        dof.lowerLimitImpulses[axis] = 0;
        dof.upperLimitImpulses[axis] = 0;
      }
      state[DOF_LOWER_IMPULSE + axis] = dof.lowerLimitImpulses[axis];
      state[DOF_UPPER_IMPULSE + axis] = dof.upperLimitImpulses[axis];
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
    // Per-axis mass and gamma, one shared bias. The six rows have six different masses, but the soft bias
    // factor is mass-independent, so every LIMITED axis writes the same value into the one slot.
    //
    // Only limited axes, and that is load-bearing rather than an optimization. A free axis never had its
    // row mass written — the loop above skips it — so its slot holds whatever was there before, and on a
    // freshly allocated state array that is `undefined`. Feeding it to the spring produces NaN, and
    // because the BIAS slot is shared, one free axis poisons the stop on every other axis. A locked axis
    // is excluded for a different reason: softening a lock would make it a spring, which its mode says it
    // is not.
    for (let axis = 0; axis < 6; axis += 1) {
      if (state[DOF_MODE + axis] !== DOF_LIMITED) continue;
      writeLimitRowParameters(
        state,
        DOF_LIMIT_MASS + axis,
        DOF_LIMIT_GAMMA + axis,
        DOF_LIMIT_BIAS,
        state[DOF_MASS + axis],
        dof.enableLimitSpring,
        dof.limitFrequencyHz,
        dof.limitDampingRatio,
        dt,
      );
    }
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
        state[DOF_LIMIT_MASS + axis],
        value - dofLower[axis],
        state[DOF_LIMIT_BIAS],
        DOF_LOWER_IMPULSE + axis,
        state[DOF_LIMIT_GAMMA + axis],
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        rowOffset,
        state[DOF_LIMIT_MASS + axis],
        dofUpper[axis] - value,
        state[DOF_LIMIT_BIAS],
        DOF_UPPER_IMPULSE + axis,
        state[DOF_LIMIT_GAMMA + axis],
      );
      dof.lowerLimitImpulses[axis] = state[DOF_LOWER_IMPULSE + axis];
      dof.upperLimitImpulses[axis] = state[DOF_UPPER_IMPULSE + axis];
    }
  },

  // Locked axes reapply the equality block's slot; limited axes reapply their own pair of one-sided
  // accumulators. The two come from different places because a locked axis is one signed row while a limited
  // axis is two rows that may only push, and neither can be read out of the other's storage.
  // Six rows, each read against the accumulator its MODE selects — a free axis carries nothing, a locked
  // one its equality impulse, a limited one the difference of its two stops. The first three rows are
  // linear and the last three angular, and the row arithmetic sorts that out without a special case.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    const dof = joint as Physics3DGeneric6DofJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return false;
    clearPhysics3DJointReaction(out);
    for (let axis = 0; axis < 6; axis += 1) {
      const mode = state[DOF_MODE + axis];
      const rowOffset = DOF_ROWS + axis * ROW_LENGTH;
      if (mode === DOF_LOCKED) {
        accumulatePhysics3DJointRowReaction(joint, state, rowOffset, readJointImpulse(joint, axis) * inverseDt, out);
      } else if (mode === DOF_LIMITED) {
        const limited = dof.lowerLimitImpulses[axis] - dof.upperLimitImpulses[axis];
        accumulatePhysics3DJointRowReaction(joint, state, rowOffset, limited * inverseDt, out);
      }
    }
    return true;
  },

  warmStart(world: Physics3DWorld, joint: Physics3DJoint): void {
    const dof = joint as Physics3DGeneric6DofJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return;
    const bodyA = findPhysics3DBody(world, joint.bodyA);
    const bodyB = findPhysics3DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    for (let axis = 0; axis < 6; axis += 1) {
      const mode = state[DOF_MODE + axis];
      const rowOffset = DOF_ROWS + axis * ROW_LENGTH;
      if (mode === DOF_LOCKED) {
        applyRow(bodyA, bodyB, state, rowOffset, readJointImpulse(joint, axis));
      } else if (mode === DOF_LIMITED) {
        applyRow(bodyA, bodyB, state, rowOffset, dof.lowerLimitImpulses[axis] - dof.upperLimitImpulses[axis]);
      }
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
    const slider = joint as Physics3DSliderJoint;
    slider.motorImpulse = 0;
    slider.lowerLimitImpulse = 0;
    slider.upperLimitImpulse = 0;
  },

  scaleAccumulatedImpulses(joint: Physics3DJoint, timestepRatio: number): void {
    const slider = joint as Physics3DSliderJoint;
    slider.motorImpulse = (slider.motorImpulse ?? 0) * timestepRatio;
    slider.lowerLimitImpulse = (slider.lowerLimitImpulse ?? 0) * timestepRatio;
    slider.upperLimitImpulse = (slider.upperLimitImpulse ?? 0) * timestepRatio;
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
    // Exchanged, not negated — see the hinge's swapEnds for why a magnitude behaves differently here from
    // the bound it holds.
    const lowerImpulse = slider.lowerLimitImpulse ?? 0;
    slider.lowerLimitImpulse = slider.upperLimitImpulse ?? 0;
    slider.upperLimitImpulse = lowerImpulse;
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
    writeLimitRowParameters(
      state,
      SLIDER_LIMIT_MASS,
      SLIDER_LIMIT_GAMMA,
      SLIDER_LIMIT_BIAS,
      state[SLIDER_AXIS_MASS],
      slider.enableLimitSpring,
      slider.limitFrequencyHz,
      slider.limitDampingRatio,
      dt,
    );
    state[SLIDER_MAX_MOTOR] = Math.max(0, dt * slider.maxMotorForce);
    slider.lowerLimitImpulse ??= 0;
    slider.upperLimitImpulse ??= 0;
    if (!slider.enableLimit) {
      slider.lowerLimitImpulse = 0;
      slider.upperLimitImpulse = 0;
    }
    state[SLIDER_LOWER_IMPULSE] = slider.lowerLimitImpulse;
    state[SLIDER_UPPER_IMPULSE] = slider.upperLimitImpulse;

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
        state[SLIDER_LIMIT_MASS],
        translation - slider.lowerTranslation,
        state[SLIDER_LIMIT_BIAS],
        SLIDER_LOWER_IMPULSE,
        state[SLIDER_LIMIT_GAMMA],
      );
      solveUpperLimitRow(
        bodyA,
        bodyB,
        state,
        SLIDER_AXIS_ROW,
        state[SLIDER_LIMIT_MASS],
        slider.upperTranslation - translation,
        state[SLIDER_LIMIT_BIAS],
        SLIDER_UPPER_IMPULSE,
        state[SLIDER_LIMIT_GAMMA],
      );
      slider.lowerLimitImpulse = state[SLIDER_LOWER_IMPULSE];
      slider.upperLimitImpulse = state[SLIDER_UPPER_IMPULSE];
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

  // Two perpendicular LINEAR rows carry the load across the rail, and the axis row carries the motor and
  // the stops ALONG it. The angular block is the rotation lock, read as a world-axis triple.
  writeReaction(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): boolean {
    const slider = joint as Physics3DSliderJoint;
    const state = getJointSolveState(joint);
    if (state === undefined) return false;
    clearPhysics3DJointReaction(out);
    accumulatePhysics3DJointRowReaction(joint, state, SLIDER_PERP_ROW0, joint.impulse0 * inverseDt, out);
    accumulatePhysics3DJointRowReaction(joint, state, SLIDER_PERP_ROW1, joint.impulse1 * inverseDt, out);
    let axial = slider.enableMotor ? (slider.motorImpulse ?? 0) : 0;
    if (slider.enableLimit) axial += (slider.lowerLimitImpulse ?? 0) - (slider.upperLimitImpulse ?? 0);
    accumulatePhysics3DJointRowReaction(joint, state, SLIDER_AXIS_ROW, axial * inverseDt, out);
    writeAngularBlockTorque(joint, inverseDt, out);
    return true;
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
    if (slider.enableLimit) {
      applyRow(bodyA, bodyB, state, SLIDER_AXIS_ROW, slider.lowerLimitImpulse - slider.upperLimitImpulse);
    }
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

// The linear force a point block carried. Its accumulators are world-axis impulses, so this is a scale
// rather than a projection.
function writePointBlockForce(joint: Readonly<Physics3DJoint>, inverseDt: number, out: Physics3DJointReaction): void {
  out.forceX += joint.impulse0 * inverseDt;
  out.forceY += joint.impulse1 * inverseDt;
  out.forceZ += joint.impulse2 * inverseDt;
}

// The torque an angular block carried. Like the point block, its three accumulators are already world-axis
// impulses — the block is built from the summed inverse inertia tensors rather than from named rows.
function writeAngularBlockTorque(
  joint: Readonly<Physics3DJoint>,
  inverseDt: number,
  out: Physics3DJointReaction,
): void {
  out.torqueX += joint.impulse3 * inverseDt;
  out.torqueY += joint.impulse4 * inverseDt;
  out.torqueZ += joint.impulse5 * inverseDt;
}

// Fills a limit row group's mass, bias, and gamma slots, choosing a hard stop or a compliant one.
//
// One BIAS slot serves every row of a joint even when the rows have different masses, and that is exact
// rather than an approximation: the soft bias factor works out to `w^2 / (2*z*w + dt*w^2)`, in which the
// mass cancels completely. Only the softened mass and gamma carry it, which is why those get a slot per
// row and the bias does not.
//
// The hard fallback is `1 / dt`, the limit rows' own full-correction factor, NOT the `BAUMGARTE / dt` a
// two-sided row uses. Passing the wrong one would leave hard stops behaving differently than before the
// spring existed.
function writeLimitRowParameters(
  state: number[],
  massSlot: number,
  gammaSlot: number,
  biasSlot: number,
  rowMass: number,
  soft: boolean,
  frequencyHz: number,
  dampingRatio: number,
  dt: number,
): void {
  if (soft && frequencyHz > 0) {
    writePhysics3DSoftRowParameters(rowMass, frequencyHz, dampingRatio, dt, 1 / dt, softRowScratch);
    state[massSlot] = softRowScratch[0];
    state[biasSlot] = softRowScratch[1];
    state[gammaSlot] = softRowScratch[2];
    return;
  }
  state[massSlot] = rowMass;
  state[biasSlot] = 1 / dt;
  state[gammaSlot] = 0;
}

const BAUMGARTE = 0.2;
const softRowScratch = [0, 0, 0];

const DISTANCE_ROW = 0;
const DISTANCE_MASS = DISTANCE_ROW + ROW_LENGTH;
const DISTANCE_BIAS = DISTANCE_MASS + 1;
const DISTANCE_GAMMA = DISTANCE_BIAS + 1;
const DISTANCE_LIMIT_MASS = DISTANCE_GAMMA + 1;
const DISTANCE_LIMIT_BIAS = DISTANCE_LIMIT_MASS + 1;
const DISTANCE_SEPARATION = DISTANCE_LIMIT_BIAS + 1;
const DISTANCE_REST_ACTIVE = DISTANCE_SEPARATION + 1;
const DISTANCE_LOWER_IMPULSE = DISTANCE_REST_ACTIVE + 1;
const DISTANCE_UPPER_IMPULSE = DISTANCE_LOWER_IMPULSE + 1;
const DISTANCE_LENGTH = DISTANCE_UPPER_IMPULSE + 1;

const distanceAxis = [0, 0, 0];

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
const HINGE_LIMIT_MASS = HINGE_UPPER_IMPULSE + 1;
const HINGE_LIMIT_GAMMA = HINGE_LIMIT_MASS + 1;
const HINGE_LENGTH = HINGE_LIMIT_GAMMA + 1;

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
const CONE_SWING_SOFT_MASS = CONE_UPPER_TWIST_IMPULSE + 1;
const CONE_SWING_GAMMA = CONE_SWING_SOFT_MASS + 1;
const CONE_TWIST_SOFT_MASS = CONE_SWING_GAMMA + 1;
const CONE_TWIST_GAMMA = CONE_TWIST_SOFT_MASS + 1;
const CONE_LENGTH = CONE_TWIST_GAMMA + 1;

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
const DOF_LIMIT_MASS = DOF_LIMIT_BIAS + 1;
const DOF_LIMIT_GAMMA = DOF_LIMIT_MASS + 6;
const DOF_LENGTH = DOF_LIMIT_GAMMA + 6;

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
const SLIDER_LIMIT_MASS = SLIDER_UPPER_IMPULSE + 1;
const SLIDER_LIMIT_GAMMA = SLIDER_LIMIT_MASS + 1;
const SLIDER_LENGTH = SLIDER_LIMIT_GAMMA + 1;

const dofLower = [0, 0, 0, 0, 0, 0];
const dofUpper = [0, 0, 0, 0, 0, 0];
const relativeRotation = [0, 0, 0, 1];
const rotationError = [0, 0, 0];
const separation = [0, 0, 0];
