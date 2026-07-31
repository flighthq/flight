import type {
  Physics2DDistanceJoint,
  Physics2DJoint,
  Physics2DMouseJoint,
  Physics2DRevoluteJoint,
  Physics2DRopeJoint,
  Physics2DWeldJoint,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';

import { applyPhysics2DImpulse } from './solver';
import { findPhysics2DBody } from './world';

// The built-in joint kinds. Bare names are reserved for these; a user's own joint takes a vendor prefix.
export const Physics2DDistanceJointKind = 'Distance';
export const Physics2DMouseJointKind = 'Mouse';
export const Physics2DRevoluteJointKind = 'Revolute';
export const Physics2DRopeJointKind = 'Rope';
export const Physics2DWeldJointKind = 'Weld';

// Holds two anchors a fixed distance apart, rigidly or as a damped spring.
//
// One scalar constraint along the axis between the anchors. Softness enters as a modified effective mass
// plus a position bias rather than as a separate force: solving a spring as a constraint keeps it stable
// at any stiffness, where adding a spring FORCE explodes once the stiffness times the timestep exceeds
// what the integrator can follow.
export const physics2DDistanceJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPhysics2DImpulse(
      bodyA,
      bodyB,
      joint.rAX,
      joint.rAY,
      joint.rBX,
      joint.rBY,
      -joint.impulse0 * state[3],
      -joint.impulse0 * state[4],
    );
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const distance = joint as Physics2DDistanceJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const axisX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const axisY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    const length = Math.sqrt(axisX * axisX + axisY * axisY);
    if (length > EPSILON) {
      axisScratch[0] = axisX / length;
      axisScratch[1] = axisY / length;
    } else {
      // Coincident anchors leave the axis undefined. Any unit vector is as correct as another and none is
      // wrong for one step, where dividing by the length would seed NaN into both bodies permanently.
      axisScratch[0] = 1;
      axisScratch[1] = 0;
    }

    const mass = axisEffectiveMass(bodyA, bodyB, joint, axisScratch[0], axisScratch[1]);
    const separation = length - distance.length;
    if (distance.stiffness > 0) {
      const angular = 2 * Math.PI * distance.stiffness;
      const damp = 2 * mass * distance.damping * angular;
      const spring = mass * angular * angular;
      const gamma = dt * (damp + dt * spring);
      jointScratch[2] = gamma > 0 ? 1 / gamma : 0;
      jointScratch[1] = separation * dt * spring * jointScratch[2];
      const softMass = mass + jointScratch[2];
      jointScratch[0] = softMass > 0 ? 1 / softMass : 0;
    } else {
      jointScratch[0] = mass > 0 ? 1 / mass : 0;
      jointScratch[1] = separation * (BAUMGARTE / dt);
      jointScratch[2] = 0;
    }
    distance.rAX = joint.rAX;
    const distanceState = acquireJointState(distance, 5);
    distanceState[0] = jointScratch[0]!;
    distanceState[1] = jointScratch[1]!;
    distanceState[2] = jointScratch[2]!;
    distanceState[3] = axisScratch[0]!;
    distanceState[4] = axisScratch[1]!;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    const [effectiveMass, bias, gamma, axisX, axisY] = state;
    const velocity = axisRelativeVelocity(bodyA, bodyB, joint, axisX, axisY);
    const lambda = -effectiveMass * (velocity + bias + gamma * joint.impulse0);
    joint.impulse0 += lambda;
    applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -lambda * axisX, -lambda * axisY);
  },
};

// Drags one body toward a moving world-space target with bounded force.
//
// Always soft, and that is not a tuning choice: a rigid drag lets a user inject unbounded energy simply by
// moving the cursor faster than the simulation can follow, and the rest of the world absorbs it. The force
// bound is what keeps a dragged body from tunnelling through a wall it is pulled into.
export const physics2DMouseJointSolver = {
  // A mouse joint drags ONE body toward a world-space target; its other end is not a body at all, and
  // callers pass whatever index is convenient. Canonical ordering exists to fix the solve order
  // BETWEEN two bodies, so with only one body there is nothing to order and the exchange is pure
  // corruption: it moved the dragged body into bodyA, and this solver acts on bodyB, so the drag
  // silently applied to the anchor instead and the dragged body never moved.
  swapEnds(): boolean {
    return false;
  },

  // No warmStart: the drag target moves between steps, so last step's impulse is aimed at a place the
  // cursor has already left. Seeding from it fights the new target rather than helping it converge.
  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const mouse = joint as Physics2DMouseJoint;
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyB === null) return;
    const cos = Math.cos(bodyB.angle);
    const sin = Math.sin(bodyB.angle);
    joint.rBX = joint.localAnchorBX * cos - joint.localAnchorBY * sin;
    joint.rBY = joint.localAnchorBX * sin + joint.localAnchorBY * cos;
    joint.rAX = 0;
    joint.rAY = 0;

    const angular = 2 * Math.PI * (mouse.stiffness > 0 ? mouse.stiffness : 5);
    const damp = 2 * mouse.damping * angular;
    const spring = angular * angular;
    const gamma = dt * (damp + dt * spring);
    const inverseGamma = gamma > 0 ? 1 / gamma : 0;
    const biasFactor = dt * spring * inverseGamma;
    // maxForce is a force; joint.impulse0/1 accumulate an impulse. Clamping one against the other was
    // a unit error worth a factor of 1/dt — at dt 0.01 the bound admitted a hundred times the force it
    // named. Convert once here, where dt is in hand, rather than in solve, which does not receive it.
    const mouseState = acquireJointState(mouse, 5);
    mouseState[0] = inverseGamma;
    mouseState[1] = biasFactor;
    mouseState[2] = dt * mouse.maxForce;
    mouseState[3] = 0;
    mouseState[4] = 0;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const mouse = joint as Physics2DMouseJoint;
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyB === null) return;

    const [inverseGamma, biasFactor, maxImpulse] = state;
    const anchorX = bodyB.x + joint.rBX;
    const anchorY = bodyB.y + joint.rBY;
    const errorX = anchorX - mouse.targetX;
    const errorY = anchorY - mouse.targetY;

    const velocityX = bodyB.velocityX - bodyB.angularVelocity * joint.rBY;
    const velocityY = bodyB.velocityY + bodyB.angularVelocity * joint.rBX;
    const mass = bodyB.inverseMass > 0 ? 1 / bodyB.inverseMass : 0;

    let impulseX = -mass * (velocityX + biasFactor * errorX + inverseGamma * joint.impulse0);
    let impulseY = -mass * (velocityY + biasFactor * errorY + inverseGamma * joint.impulse1);
    const previousX = joint.impulse0;
    const previousY = joint.impulse1;
    joint.impulse0 += impulseX;
    joint.impulse1 += impulseY;
    // Clamped on the ACCUMULATED impulse, so a later iteration can correct an earlier overshoot while the
    // total force stays inside the bound.
    const magnitude = Math.sqrt(joint.impulse0 * joint.impulse0 + joint.impulse1 * joint.impulse1);
    if (magnitude > maxImpulse && magnitude > 0) {
      const scale = maxImpulse / magnitude;
      joint.impulse0 *= scale;
      joint.impulse1 *= scale;
    }
    impulseX = joint.impulse0 - previousX;
    impulseY = joint.impulse1 - previousY;
    bodyB.velocityX += impulseX * bodyB.inverseMass;
    bodyB.velocityY += impulseY * bodyB.inverseMass;
    bodyB.angularVelocity += bodyB.inverseInertia * (joint.rBX * impulseY - joint.rBY * impulseX);
  },
};

// Pins two bodies at a point, leaving rotation free — a hinge.
//
// Two scalar constraints, one per axis of the shared point, solved as a coupled pair rather than
// independently: solving x then y lets each undo part of the other's correction, and a hinge under load
// visibly creeps.
export const physics2DRevoluteJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -joint.impulse0, -joint.impulse1);
    // The motor accumulator persists across steps, so it has to be REAPPLIED here like every other
    // persisted impulse. Warm-starting only the point pair left it accumulating without ever acting:
    // the solve clamps the running total against maxMotorTorque * dt, so once it reached that bound it
    // stayed there and every later step added nothing. A low-torque motor would apply its first
    // increment and then hold the same value forever, looking like a motor that had reached speed while
    // the body never moved.
    //
    // Gated on the CURRENT enableMotor, not on the value being non-zero. A cached impulse is only valid
    // while the thing that produced it is still running: `solve` skips a disabled motor, so reapplying
    // its last impulse here would exert torque no solver ever asks for and nothing ever cancels — a
    // disabled motor that keeps turning the joint forever. Clearing rather than merely skipping means a
    // motor switched back on starts from rest instead of resuming a stale accumulator from whenever it
    // was last enabled.
    //
    // Defaulted rather than compared against 0: a joint deserialized or built without the motor fields
    // has no motorImpulse at all, and multiplying undefined by an inverse inertia produces NaN, which
    // then spreads through every subsequent velocity.
    const revolute = joint as Physics2DRevoluteJoint;
    const motorImpulse = revolute.motorImpulse ?? 0;
    if (!revolute.enableMotor) {
      revolute.motorImpulse = 0;
    } else if (motorImpulse !== 0) {
      bodyA.angularVelocity -= bodyA.inverseInertia * motorImpulse;
      bodyB.angularVelocity += bodyB.inverseInertia * motorImpulse;
    }
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    (joint as Physics2DRevoluteJoint).motorImpulse = 0;
  },

  // Swapping the ends reverses the sense of every angular quantity this solver reads. The relative
  // angle is measured bodyA -> bodyB, so it negates; the limit interval negates AND its ends exchange
  // (the old lower bound becomes the new upper); and the motor's target relative velocity reverses.
  // Deriving it: the constraint is lower <= (angleB - angleA - reference) <= upper. Writing t for
  // (angleB - angleA), that is lower + reference <= t <= upper + reference. After the swap t becomes
  // -t, so the same physical interval requires reference' = -reference, lower' = -upper and
  // upper' = -lower.
  swapEnds(joint: Physics2DJoint): boolean {
    const revolute = joint as Physics2DRevoluteJoint;
    const lower = revolute.lowerAngle;
    revolute.lowerAngle = -revolute.upperAngle;
    revolute.upperAngle = -lower;
    revolute.referenceAngle = -revolute.referenceAngle;
    revolute.motorSpeed = -revolute.motorSpeed;
    revolute.motorImpulse = -revolute.motorImpulse;
    return true;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const revolute = joint as Physics2DRevoluteJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);
    const errorX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const errorY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    // The angular constraints share one effective mass: the pair's combined resistance to a relative
    // spin. Zero when neither body can rotate, which disables motor and limits rather than dividing
    // by zero.
    const inverseInertiaSum = bodyA.inverseInertia + bodyB.inverseInertia;
    const angularMass = inverseInertiaSum > 0 ? 1 / inverseInertiaSum : 0;
    const revoluteState = acquireJointState(joint, 7);
    revoluteState[0] = errorX * (BAUMGARTE / dt);
    revoluteState[1] = errorY * (BAUMGARTE / dt);
    revoluteState[2] = angularMass;
    revoluteState[3] = 0;
    revoluteState[4] = 0;
    revoluteState[5] = dt * revolute.maxMotorTorque;
    revoluteState[6] = 1 / dt;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const revolute = joint as Physics2DRevoluteJoint;
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    const angularMass = state[2];
    if (angularMass > 0) {
      // Motor first: it is a soft target the limits are allowed to override, so solving it before the
      // limits lets a limit's impulse win in the same iteration when they disagree.
      if (revolute.enableMotor) {
        const maxMotorImpulse = state[5];
        const relative = bodyB.angularVelocity - bodyA.angularVelocity - revolute.motorSpeed;
        const desired = -angularMass * relative;
        const previous = revolute.motorImpulse;
        // Clamped on the ACCUMULATED impulse against torque * dt, so the bound is a torque and not a
        // per-iteration one that would scale with the iteration count.
        const total = Math.min(Math.max(previous + desired, -maxMotorImpulse), maxMotorImpulse);
        revolute.motorImpulse = total;
        const applied = total - previous;
        bodyA.angularVelocity -= bodyA.inverseInertia * applied;
        bodyB.angularVelocity += bodyB.inverseInertia * applied;
      }

      if (revolute.enableLimit) {
        const bias = state[6];
        const angle = bodyB.angle - bodyA.angle - revolute.referenceAngle;
        // Each end is a one-sided constraint: the non-negative clamp on the running impulse lets a
        // limit push the angle back inside the interval and never pull it in.
        //
        // The bias is the SIGNED distance to the bound, C / dt, with no clamp on C — and both clamps
        // are wrong, in opposite ways:
        //
        //   max(C, 0) suppresses correctly but cannot correct. It zeroes the bias exactly when the
        //   angle is already outside the interval, leaving only the relative-velocity term, so a joint
        //   authored out of range and sitting still is never pushed back: it stays violated forever.
        //
        //   min(C, 0) corrects but cannot suppress. It zeroes the bias while INSIDE the interval, and
        //   the upper end then reads a positive desired impulse against any forward rotation and brakes
        //   it to a standstill — a motor at speed 5 held the arm at exactly zero, spending its whole
        //   torque budget against a limit it was nowhere near.
        //
        // Signed C does both. Inside the interval it is positive, which drives the desired impulse
        // negative and the clamp holds the accumulator at zero, so the limit contributes nothing.
        // Outside it is negative, which drives the desired impulse positive and pushes the angle back.
        const lowerError = angle - revolute.lowerAngle;
        const lowerDesired = -angularMass * (bodyB.angularVelocity - bodyA.angularVelocity + lowerError * bias);
        const lowerPrevious = state[3];
        const lowerTotal = Math.max(lowerPrevious + lowerDesired, 0);
        state[3] = lowerTotal;
        const lowerApplied = lowerTotal - lowerPrevious;
        bodyA.angularVelocity -= bodyA.inverseInertia * lowerApplied;
        bodyB.angularVelocity += bodyB.inverseInertia * lowerApplied;

        const upperError = revolute.upperAngle - angle;
        const upperDesired = -angularMass * (bodyA.angularVelocity - bodyB.angularVelocity + upperError * bias);
        const upperPrevious = state[4];
        const upperTotal = Math.max(upperPrevious + upperDesired, 0);
        state[4] = upperTotal;
        const upperApplied = upperTotal - upperPrevious;
        bodyA.angularVelocity += bodyA.inverseInertia * upperApplied;
        bodyB.angularVelocity -= bodyB.inverseInertia * upperApplied;
      }
    }

    solvePointConstraint(bodyA, bodyB, joint, state[0], state[1]);
  },
};

// An inequality constraint that acts only at full extension. Slack within `maxLength`, caught at it.
//
// The non-negative clamp on the accumulated impulse is what makes it a rope rather than a stiff bar: a
// rope may pull the bodies together and may never push them apart.
export const physics2DRopeJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPhysics2DImpulse(
      bodyA,
      bodyB,
      joint.rAX,
      joint.rAY,
      joint.rBX,
      joint.rBY,
      -joint.impulse0 * state[3],
      -joint.impulse0 * state[4],
    );
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const rope = joint as Physics2DRopeJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const axisX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const axisY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    const length = Math.sqrt(axisX * axisX + axisY * axisY);
    const unitX = length > EPSILON ? axisX / length : 1;
    const unitY = length > EPSILON ? axisY / length : 0;
    const mass = axisEffectiveMass(bodyA, bodyB, joint, unitX, unitY);
    const excess = length - rope.maxLength;
    // Slack: no constraint at all this step, which is what a rope IS. Marked by a zero effective mass so
    // the iterations skip it without a second flag to keep in sync.
    const active = excess > 0;
    const ropeState = acquireJointState(rope, 5);
    ropeState[0] = active && mass > 0 ? 1 / mass : 0;
    ropeState[1] = active ? excess * (BAUMGARTE / dt) : 0;
    ropeState[2] = 0;
    ropeState[3] = unitX;
    ropeState[4] = unitY;
    if (!active) joint.impulse0 = 0;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointStateScratch.get(joint);
    if (state === undefined || state[0] === 0) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    const [effectiveMass, bias, , axisX, axisY] = state;
    const velocity = axisRelativeVelocity(bodyA, bodyB, joint, axisX, axisY);
    let lambda = -effectiveMass * (velocity + bias);
    const previous = joint.impulse0;
    joint.impulse0 = Math.min(0, previous + lambda);
    lambda = joint.impulse0 - previous;
    applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -lambda * axisX, -lambda * axisY);
  },
};

// Pins the anchors together and locks the relative angle — rigid attachment.
//
// The point constraint plus one angular constraint. It is solved rather than exact, so it flexes under
// enough load; a truly rigid attachment is one body with two colliders, and the difference is that a weld
// can be broken at runtime.
// Weld holds the pair at a fixed relative angle, measured from bodyA to bodyB, so exchanging the ends
// reverses that measurement and the stored reference angle must be negated with them. It is the only
// direction-bearing field any solver reads today: revolute declares one but does not yet read it, and
// prismatic has no solver at all, so their transforms land with the work that makes them live.
export const physics2DWeldJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -joint.impulse0, -joint.impulse1);
    bodyA.angularVelocity -= bodyA.inverseInertia * joint.impulse2;
    bodyB.angularVelocity += bodyB.inverseInertia * joint.impulse2;
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
  },

  swapEnds(joint: Physics2DJoint): boolean {
    const weld = joint as Physics2DWeldJoint;
    weld.referenceAngle = -weld.referenceAngle;
    return true;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const weld = joint as Physics2DWeldJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);
    const errorX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const errorY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    const angleError = bodyB.angle - bodyA.angle - weld.referenceAngle;
    const angularMass = bodyA.inverseInertia + bodyB.inverseInertia;
    const weldState = acquireJointState(weld, 5);
    weldState[0] = errorX * (BAUMGARTE / dt);
    weldState[1] = errorY * (BAUMGARTE / dt);
    weldState[2] = angleError * (BAUMGARTE / dt);
    weldState[3] = angularMass > 0 ? 1 / angularMass : 0;
    weldState[4] = 0;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointStateScratch.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    const angularVelocity = bodyB.angularVelocity - bodyA.angularVelocity;
    const angularLambda = -state[3] * (angularVelocity + state[2]);
    joint.impulse2 += angularLambda;
    bodyA.angularVelocity -= bodyA.inverseInertia * angularLambda;
    bodyB.angularVelocity += bodyB.inverseInertia * angularLambda;

    solvePointConstraint(bodyA, bodyB, joint, state[0], state[1]);
  },
};

// The shared two-axis point solve behind revolute and weld. Each axis is solved against the velocities the
// other just left, which is the sequential-impulse property doing its job within one constraint.
function solvePointConstraint(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  joint: Physics2DJoint,
  biasX: number,
  biasY: number,
): void {
  const massX = axisEffectiveMass(bodyA, bodyB, joint, 1, 0);
  const velocityX = axisRelativeVelocity(bodyA, bodyB, joint, 1, 0);
  const lambdaX = massX > 0 ? -(velocityX + biasX) / massX : 0;
  joint.impulse0 += lambdaX;
  applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -lambdaX, 0);

  const massY = axisEffectiveMass(bodyA, bodyB, joint, 0, 1);
  const velocityY = axisRelativeVelocity(bodyA, bodyB, joint, 0, 1);
  const lambdaY = massY > 0 ? -(velocityY + biasY) / massY : 0;
  joint.impulse1 += lambdaY;
  applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, 0, -lambdaY);
}

// Rotates each body's local anchor into world space, relative to that body's centre of mass — the lever
// arm every joint impulse acts through.
function writeJointAnchors(bodyA: Readonly<RigidBody2D>, bodyB: Readonly<RigidBody2D>, joint: Physics2DJoint): void {
  const cosA = Math.cos(bodyA.angle);
  const sinA = Math.sin(bodyA.angle);
  const cosB = Math.cos(bodyB.angle);
  const sinB = Math.sin(bodyB.angle);
  joint.rAX = (joint.localAnchorAX - bodyA.centerX) * cosA - (joint.localAnchorAY - bodyA.centerY) * sinA;
  joint.rAY = (joint.localAnchorAX - bodyA.centerX) * sinA + (joint.localAnchorAY - bodyA.centerY) * cosA;
  joint.rBX = (joint.localAnchorBX - bodyB.centerX) * cosB - (joint.localAnchorBY - bodyB.centerY) * sinB;
  joint.rBY = (joint.localAnchorBX - bodyB.centerX) * sinB + (joint.localAnchorBY - bodyB.centerY) * cosB;
}

// The pair's inverse effective mass along `axis` at the joint anchors — the same quantity a contact
// constraint uses, over the joint's lever arms instead of a contact point's.
function axisEffectiveMass(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  joint: Readonly<Physics2DJoint>,
  axisX: number,
  axisY: number,
): number {
  const crossA = joint.rAX * axisY - joint.rAY * axisX;
  const crossB = joint.rBX * axisY - joint.rBY * axisX;
  return (
    bodyA.inverseMass +
    bodyB.inverseMass +
    bodyA.inverseInertia * crossA * crossA +
    bodyB.inverseInertia * crossB * crossB
  );
}

function axisRelativeVelocity(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  joint: Readonly<Physics2DJoint>,
  axisX: number,
  axisY: number,
): number {
  const vax = bodyA.velocityX - bodyA.angularVelocity * joint.rAY;
  const vay = bodyA.velocityY + bodyA.angularVelocity * joint.rAX;
  const vbx = bodyB.velocityX - bodyB.angularVelocity * joint.rBY;
  const vby = bodyB.velocityY + bodyB.angularVelocity * joint.rBX;
  // B relative to A, the same sense as the positional error the bias is built from, so a positive value
  // means the pair is separating along this axis. The contact solver measures the OPPOSITE sense, because
  // its normal points the other way. Mixing the two is not a sign slip that shows up as a small error: the
  // correction then adds to the violation instead of cancelling it, every iteration compounds it, and the
  // bodies leave the world within one step.
  return (vbx - vax) * axisX + (vby - vay) * axisY;
}

// Fills this joint's per-step state in place, allocating the array only the first time the joint is
// prepared. Every solver rebuilds its whole block each step, so the array is pure scratch and reusing it
// costs nothing — but allocating a fresh one per joint per step made the step's allocation profile scale
// with the joint count, which is exactly the hidden per-frame allocation the package's own charter
// forbids.
// Returns this joint's reusable per-step scratch, sized to `length`, for the caller to write into by
// index. It deliberately does not take the values: a `(joint, [a, b, c])` signature allocates the
// literal at every call site on every step, so the array the joint reuses was only ever the
// destination — the source was fresh garbage each frame, one array per joint per step. Handing the
// destination back is what makes the prepare pass allocation-free, and it matches the SDK's
// write-into-out convention rather than returning a new value.
function acquireJointState(joint: Physics2DJoint, length: number): number[] {
  let state = jointStateScratch.get(joint);
  if (state === undefined) {
    state = [];
    jointStateScratch.set(joint, state);
  }
  state.length = length;
  return state;
}

// Per-step solver state, keyed by joint. A Map rather than fields on the joint because the numbers each
// solver needs mean different things per kind, and putting a fixed block of untyped scratch on the
// public entity would make the header describe the solver's internals.
//
// Mutable, because a one-sided constraint accumulates its impulse ACROSS the velocity iterations of a
// single step: the revolute limits clamp their running totals to stay non-negative, which is what makes
// them limits rather than springs, and that total has to live somewhere between iterations.
//
// A WeakMap, not a Map. A module-global strong Map keyed by joint retains every joint ever prepared for
// the lifetime of the module: removing a joint from a world drops the world's reference but not this
// one, so the joint, its bodies' indices, and its state array all stay reachable forever. There is no
// deletion hook to forget either, because a joint can leave a world without this module being told.
// Keying weakly makes the retention question disappear rather than answering it — the entry goes when
// the joint does, at every exit path, including ones nobody has written yet.
const jointStateScratch = new WeakMap<Physics2DJoint, number[]>();
const axisScratch = [0, 0];
const jointScratch = [0, 0, 0];
const EPSILON = 1e-9;
// The fraction of a joint's positional error corrected per step. Matches the contact solver's rationale:
// correcting all of it at once turns a deep error into an explosion.
const BAUMGARTE = 0.2;
