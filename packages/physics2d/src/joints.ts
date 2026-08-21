import type {
  Physics2DDistanceJoint,
  Physics2DJointReaction,
  Physics2DGearJoint,
  Physics2DJoint,
  Physics2DMouseJoint,
  Physics2DPrismaticJoint,
  Physics2DPulleyJoint,
  Physics2DRevoluteJoint,
  Physics2DRopeJoint,
  Physics2DWheelJoint,
  Physics2DWeldJoint,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';

import { writePhysics2DSoftRowParameters } from './jointRows';
import { applyPhysics2DImpulse } from './solver';
import { findPhysics2DBody } from './world';

// The built-in joint kinds. Bare names are reserved for these; a user's own joint takes a vendor prefix.
export const Physics2DDistanceJointKind = 'Distance';
export const Physics2DGearJointKind = 'Gear';
export const Physics2DMouseJointKind = 'Mouse';
export const Physics2DPrismaticJointKind = 'Prismatic';
export const Physics2DPulleyJointKind = 'Pulley';
export const Physics2DRevoluteJointKind = 'Revolute';
export const Physics2DRopeJointKind = 'Rope';
export const Physics2DWheelJointKind = 'Wheel';
export const Physics2DWeldJointKind = 'Weld';

// Holds two anchors a fixed distance apart, rigidly or as a damped spring.
//
// One scalar constraint along the axis between the anchors. Softness enters as a modified effective mass
// plus a position bias rather than as a separate force: solving a spring as a constraint keeps it stable
// at any frequency, where adding a spring FORCE explodes once its response outruns the timestep
// what the integrator can follow.
export const physics2DDistanceJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
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
    let normalizedAxisX: number;
    let normalizedAxisY: number;
    if (length > EPSILON) {
      normalizedAxisX = axisX / length;
      normalizedAxisY = axisY / length;
    } else {
      // Coincident anchors leave the axis undefined. Any unit vector is as correct as another and none is
      // wrong for one step, where dividing by the length would seed NaN into both bodies permanently.
      normalizedAxisX = 1;
      normalizedAxisY = 0;
    }

    const inverseMass = axisInverseEffectiveMass(bodyA, bodyB, joint, normalizedAxisX, normalizedAxisY);
    const separation = length - distance.length;
    writePhysics2DSoftRowParameters(
      inverseMass > 0 ? 1 / inverseMass : 0,
      distance.frequencyHz,
      distance.dampingRatio,
      dt,
      BAUMGARTE / dt,
      softRowScratch,
    );
    distance.rAX = joint.rAX;
    const distanceState = beginJointSolve(distance, 5);
    distanceState[0] = softRowScratch[0];
    distanceState[1] = separation * softRowScratch[1];
    distanceState[2] = softRowScratch[2];
    distanceState[3] = normalizedAxisX;
    distanceState[4] = normalizedAxisY;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
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
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // `impulse0` is a signed scalar along the anchor-to-anchor axis, negative when the joint is
    // stretched and pulling its ends together.
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0 * state[3],
      joint.impulse0 * state[4],
      0,
      inverseTimestep,
      out,
    );
  },
};

// Couples two scalar coordinates measured against the world frame. Each coordinate contributes one
// Jacobian row: rotation contributes angular velocity directly, while translation contributes the
// velocity of the joint anchor projected onto a fixed axis. The ratio scales both the second body's
// Jacobian and its effective mass, which is the same mechanism behind meshed gears, linked racks, and a
// rack-and-pinion pair.
export const physics2DGearJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyGearImpulse(bodyA, bodyB, state, joint.impulse0);
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
  },

  swapEnds(joint: Physics2DJoint): boolean {
    const gear = joint as Physics2DGearJoint;
    if (Math.abs(gear.ratio) < EPSILON) return false;
    const ratio = gear.ratio;
    const coordinate = gear.coordinateA;
    const axisX = gear.axisAX;
    const axisY = gear.axisAY;
    gear.coordinateA = gear.coordinateB;
    gear.coordinateB = coordinate;
    gear.axisAX = gear.axisBX;
    gear.axisAY = gear.axisBY;
    gear.axisBX = axisX;
    gear.axisBY = axisY;
    gear.ratio = 1 / ratio;
    gear.constant /= ratio;
    joint.impulse0 = (joint.impulse0 ?? 0) * ratio;
    return true;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const gear = joint as Physics2DGearJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const state = beginJointSolve(gear, 9);
    writeGearJacobian(gear.coordinateA, gear.axisAX, gear.axisAY, joint.rAX, joint.rAY, state, 0);
    writeGearJacobian(gear.coordinateB, gear.axisBX, gear.axisBY, joint.rBX, joint.rBY, state, 3);
    const massA =
      bodyA.inverseMass * (state[0] * state[0] + state[1] * state[1]) + bodyA.inverseInertia * state[2] * state[2];
    const massB =
      bodyB.inverseMass * (state[3] * state[3] + state[4] * state[4]) + bodyB.inverseInertia * state[5] * state[5];
    const denominator = massA + gear.ratio * gear.ratio * massB;
    const coordinateA = gearCoordinate(bodyA, joint.rAX, joint.rAY, gear.coordinateA, state[0], state[1]);
    const coordinateB = gearCoordinate(bodyB, joint.rBX, joint.rBY, gear.coordinateB, state[3], state[4]);
    state[6] = denominator > 0 ? 1 / denominator : 0;
    state[7] = (coordinateA + gear.ratio * coordinateB - gear.constant) * (BAUMGARTE / dt);
    state[8] = gear.ratio;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    const velocityA = bodyA.velocityX * state[0] + bodyA.velocityY * state[1] + bodyA.angularVelocity * state[2];
    const velocityB = bodyB.velocityX * state[3] + bodyB.velocityY * state[4] + bodyB.angularVelocity * state[5];
    const lambda = -state[6] * (velocityA + state[8] * velocityB + state[7]);
    joint.impulse0 += lambda;
    applyGearImpulse(bodyA, bodyB, state, lambda);
  },
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // A gear DOES have a reaction, and the same expression covers both coordinate kinds: `state[3..5]`
    // is body B's Jacobian row, which is `(0,0,1)` for an angular coordinate — giving a pure torque and
    // no force — and `(unit, r x unit)` for a translational one, giving a force along the axis and no
    // couple beyond it. The ratio scales B's whole row, so it multiplies the impulse once here.
    const impulse = joint.impulse0 * state[8];
    return writePhysics2DReactionFromImpulses(
      joint,
      impulse * state[3],
      impulse * state[4],
      impulse * state[5],
      inverseTimestep,
      out,
    );
  },
};

// Drags one body toward a moving world-space target with bounded force.
//
// Always soft, and that is not a tuning choice: a rigid drag lets a user inject unbounded energy simply by
// moving the cursor faster than the simulation can follow, and the rest of the world absorbs it. The force
// bound is what keeps a dragged body from tunnelling through a wall it is pulled into.
export const physics2DMouseJointSolver = {
  usesBodyA: false,
  keepsBodiesAwake: true,

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
    const localAnchorX = joint.localAnchorBX - bodyB.centerX;
    const localAnchorY = joint.localAnchorBY - bodyB.centerY;
    joint.rBX = localAnchorX * cos - localAnchorY * sin;
    joint.rBY = localAnchorX * sin + localAnchorY * cos;
    joint.rAX = 0;
    joint.rAY = 0;

    // The mouse spring is tuned against the body's own mass rather than a row denominator: it drags a
    // free body toward a target rather than constraining a pair, so there is no lever arm to fold in.
    // Only `gamma` and the bias factor are taken from the derivation — the row mass it returns is scalar
    // and this constraint is a 2x2 block, so softness enters on the matrix diagonal below instead.
    writePhysics2DSoftRowParameters(
      bodyB.inverseMass > 0 ? 1 / bodyB.inverseMass : 0,
      mouse.frequencyHz > 0 ? mouse.frequencyHz : DEFAULT_MOUSE_FREQUENCY_HZ,
      mouse.dampingRatio,
      dt,
      // Unreachable: the frequency above is always positive, so only a non-positive timestep takes the
      // hard path, and a step of no duration should correct nothing.
      0,
      softRowScratch,
    );
    const biasFactor = softRowScratch[1];
    const gamma = softRowScratch[2];
    const k11 = bodyB.inverseMass + bodyB.inverseInertia * joint.rBY * joint.rBY + gamma;
    const k12 = -bodyB.inverseInertia * joint.rBX * joint.rBY;
    const k22 = bodyB.inverseMass + bodyB.inverseInertia * joint.rBX * joint.rBX + gamma;
    const determinant = k11 * k22 - k12 * k12;
    const inverseDeterminant = Math.abs(determinant) > EPSILON ? 1 / determinant : 0;
    // maxForce is a force; joint.impulse0/1 accumulate an impulse. Clamping one against the other was
    // a unit error worth a factor of 1/dt — at dt 0.01 the bound admitted a hundred times the force it
    // named. Convert once here, where dt is in hand, rather than in solve, which does not receive it.
    const mouseState = beginJointSolve(mouse, 6);
    mouseState[0] = k22 * inverseDeterminant;
    mouseState[1] = -k12 * inverseDeterminant;
    mouseState[2] = k11 * inverseDeterminant;
    mouseState[3] = gamma;
    mouseState[4] = biasFactor;
    mouseState[5] = dt * mouse.maxForce;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const mouse = joint as Physics2DMouseJoint;
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyB === null) return;

    const [massXX, massXY, massYY, gamma, biasFactor, maxImpulse] = state;
    const anchorX = bodyB.x + joint.rBX;
    const anchorY = bodyB.y + joint.rBY;
    const errorX = anchorX - mouse.targetX;
    const errorY = anchorY - mouse.targetY;

    const velocityX = bodyB.velocityX - bodyB.angularVelocity * joint.rBY;
    const velocityY = bodyB.velocityY + bodyB.angularVelocity * joint.rBX;
    const constraintX = velocityX + biasFactor * errorX + gamma * joint.impulse0;
    const constraintY = velocityY + biasFactor * errorY + gamma * joint.impulse1;
    let impulseX = -(massXX * constraintX + massXY * constraintY);
    let impulseY = -(massXY * constraintX + massYY * constraintY);
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
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // The one kind whose accumulators are already a world-space impulse on B, because the drag is
    // applied to B directly rather than through the equal-and-opposite pair helper. There is no body A
    // to push back on: the reaction goes to the world, which is what makes a mouse joint able to add
    // momentum rather than only redistribute it.
    return writePhysics2DReactionFromImpulses(joint, joint.impulse0, joint.impulse1, 0, inverseTimestep, out);
  },
};

// Constrains two anchors to one translation axis and locks their relative angle — a slider, piston, or
// elevator rail. The perpendicular and angular constraints are solved as a coupled 2x2 block because
// an off-centre perpendicular impulse also rotates the bodies. The axis lane is independent and may be
// free, motor-driven, or bounded by translation limits.
export const physics2DPrismaticJointSolver = {
  scaleAccumulatedImpulses(joint: Physics2DJoint, timestepRatio: number): void {
    const prismatic = joint as Physics2DPrismaticJoint;
    prismatic.motorImpulse = (prismatic.motorImpulse ?? 0) * timestepRatio;
  },

  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const prismatic = joint as Physics2DPrismaticJoint;
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPrismaticImpulse(
      bodyA,
      bodyB,
      state[0],
      state[1],
      state[2],
      state[3],
      state[4],
      state[5],
      state[6],
      state[7],
      joint.impulse0,
      joint.impulse1,
      joint.impulse2 + prismatic.motorImpulse,
    );
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    (joint as Physics2DPrismaticJoint).motorImpulse = 0;
  },

  // Preserve the physical positive translation direction while canonicalizing the bodies. Swapping the
  // ends reverses their separation, so the new axis is the old world axis expressed in old body B's
  // local frame and negated. `referenceAngle` is precisely the rotation between those two frames.
  swapEnds(joint: Physics2DJoint): boolean {
    const prismatic = joint as Physics2DPrismaticJoint;
    const axisX = prismatic.localAxisAX;
    const axisY = prismatic.localAxisAY;
    const cos = Math.cos(prismatic.referenceAngle);
    const sin = Math.sin(prismatic.referenceAngle);
    prismatic.localAxisAX = -(axisX * cos + axisY * sin);
    prismatic.localAxisAY = axisX * sin - axisY * cos;
    prismatic.referenceAngle = -prismatic.referenceAngle;
    joint.impulse1 = -(joint.impulse1 ?? 0);
    prismatic.motorImpulse ??= 0;
    return true;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const prismatic = joint as Physics2DPrismaticJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const localLength = Math.sqrt(
      prismatic.localAxisAX * prismatic.localAxisAX + prismatic.localAxisAY * prismatic.localAxisAY,
    );
    const localAxisX = localLength > EPSILON ? prismatic.localAxisAX / localLength : 1;
    const localAxisY = localLength > EPSILON ? prismatic.localAxisAY / localLength : 0;
    const cos = Math.cos(bodyA.angle);
    const sin = Math.sin(bodyA.angle);
    const axisX = localAxisX * cos - localAxisY * sin;
    const axisY = localAxisX * sin + localAxisY * cos;
    const perpendicularX = -axisY;
    const perpendicularY = axisX;
    const distanceX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const distanceY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    const s1 = (distanceX + joint.rAX) * perpendicularY - (distanceY + joint.rAY) * perpendicularX;
    const s2 = joint.rBX * perpendicularY - joint.rBY * perpendicularX;
    const a1 = (distanceX + joint.rAX) * axisY - (distanceY + joint.rAY) * axisX;
    const a2 = joint.rBX * axisY - joint.rBY * axisX;

    const k11 = bodyA.inverseMass + bodyB.inverseMass + bodyA.inverseInertia * s1 * s1 + bodyB.inverseInertia * s2 * s2;
    const k12 = bodyA.inverseInertia * s1 + bodyB.inverseInertia * s2;
    const k22 = bodyA.inverseInertia + bodyB.inverseInertia;
    const axisMass =
      bodyA.inverseMass + bodyB.inverseMass + bodyA.inverseInertia * a1 * a1 + bodyB.inverseInertia * a2 * a2;
    const state = beginJointSolve(prismatic, 17);
    state[0] = axisX;
    state[1] = axisY;
    state[2] = perpendicularX;
    state[3] = perpendicularY;
    state[4] = s1;
    state[5] = s2;
    state[6] = a1;
    state[7] = a2;
    state[8] = k11;
    state[9] = k12;
    state[10] = k22;
    state[11] = axisMass > 0 ? 1 / axisMass : 0;
    state[12] = (distanceX * perpendicularX + distanceY * perpendicularY) * (BAUMGARTE / dt);
    state[13] = (bodyB.angle - bodyA.angle - prismatic.referenceAngle) * (BAUMGARTE / dt);
    state[14] = BAUMGARTE / dt;
    state[15] = Math.max(0, dt * prismatic.maxMotorForce);
    state[16] = distanceX * axisX + distanceY * axisY;
    prismatic.motorImpulse ??= 0;
    if (prismatic.enableMotor) {
      prismatic.motorImpulse = Math.min(Math.max(prismatic.motorImpulse, -state[15]), state[15]);
    } else {
      prismatic.motorImpulse = 0;
    }
    if (!prismatic.enableLimit) {
      joint.impulse2 = 0;
    } else if (Math.abs(prismatic.upperTranslation - prismatic.lowerTranslation) >= EPSILON) {
      if (state[16] < prismatic.lowerTranslation) {
        if (joint.impulse2 < 0) joint.impulse2 = 0;
      } else if (state[16] > prismatic.upperTranslation) {
        if (joint.impulse2 > 0) joint.impulse2 = 0;
      } else {
        joint.impulse2 = 0;
      }
    }
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const prismatic = joint as Physics2DPrismaticJoint;
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    const axisX = state[0];
    const axisY = state[1];
    const perpendicularX = state[2];
    const perpendicularY = state[3];
    const s1 = state[4];
    const s2 = state[5];
    const a1 = state[6];
    const a2 = state[7];
    const axisMass = state[11];

    if (prismatic.enableMotor && axisMass > 0) {
      const velocity = prismaticAxisVelocity(bodyA, bodyB, axisX, axisY, a1, a2);
      const desired = -axisMass * (velocity - prismatic.motorSpeed);
      const previous = prismatic.motorImpulse;
      const maxImpulse = state[15];
      prismatic.motorImpulse = Math.min(Math.max(previous + desired, -maxImpulse), maxImpulse);
      applyPrismaticImpulse(
        bodyA,
        bodyB,
        axisX,
        axisY,
        perpendicularX,
        perpendicularY,
        s1,
        s2,
        a1,
        a2,
        0,
        0,
        prismatic.motorImpulse - previous,
      );
    }

    if (prismatic.enableLimit && axisMass > 0) {
      const translation = state[16];
      const velocity = prismaticAxisVelocity(bodyA, bodyB, axisX, axisY, a1, a2);
      const previous = joint.impulse2;
      let total = previous;
      if (Math.abs(prismatic.upperTranslation - prismatic.lowerTranslation) < EPSILON) {
        const error = translation - prismatic.lowerTranslation;
        total += -axisMass * (velocity + error * state[14]);
      } else if (translation < prismatic.lowerTranslation) {
        const lowerPrevious = previous < 0 ? 0 : previous;
        const error = translation - prismatic.lowerTranslation;
        total = Math.max(0, lowerPrevious - axisMass * (velocity + error * state[14]));
      } else if (translation > prismatic.upperTranslation) {
        const upperPrevious = previous > 0 ? 0 : previous;
        const error = translation - prismatic.upperTranslation;
        total = Math.min(0, upperPrevious - axisMass * (velocity + error * state[14]));
      } else {
        total = 0;
      }
      joint.impulse2 = total;
      applyPrismaticImpulse(
        bodyA,
        bodyB,
        axisX,
        axisY,
        perpendicularX,
        perpendicularY,
        s1,
        s2,
        a1,
        a2,
        0,
        0,
        total - previous,
      );
    }

    // `perpendicular` rotates with body A, so the Jacobian includes distance from A's centre to B's
    // anchor (`s1`), not merely A's own anchor lever arm. Using the point-to-point relative velocity
    // here while using `s1` in the effective-mass matrix makes the two halves describe different
    // constraints and leaks perpendicular motion whenever the rail body rotates.
    const perpendicularVelocity =
      (bodyB.velocityX - bodyA.velocityX) * perpendicularX +
      (bodyB.velocityY - bodyA.velocityY) * perpendicularY +
      s2 * bodyB.angularVelocity -
      s1 * bodyA.angularVelocity;
    const angularVelocity = bodyB.angularVelocity - bodyA.angularVelocity;
    const c1 = perpendicularVelocity + state[12];
    const c2 = angularVelocity + state[13];
    const determinant = state[8] * state[10] - state[9] * state[9];
    let perpendicularImpulse = 0;
    let angularImpulse = 0;
    if (Math.abs(determinant) > EPSILON) {
      perpendicularImpulse = -(state[10] * c1 - state[9] * c2) / determinant;
      angularImpulse = -(-state[9] * c1 + state[8] * c2) / determinant;
    } else {
      perpendicularImpulse = state[8] > 0 ? -c1 / state[8] : 0;
      angularImpulse = state[10] > 0 ? -c2 / state[10] : 0;
    }
    joint.impulse0 += perpendicularImpulse;
    joint.impulse1 += angularImpulse;
    applyPrismaticImpulse(
      bodyA,
      bodyB,
      axisX,
      axisY,
      perpendicularX,
      perpendicularY,
      s1,
      s2,
      a1,
      a2,
      perpendicularImpulse,
      angularImpulse,
      0,
    );
  },
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // The rail carries three lanes and they are not interchangeable. `impulse0` resists sideways
    // motion across the axis, `impulse2` plus the motor pushes ALONG it — a slider's motor is a linear
    // drive, so it belongs in the force and not the torque — and `impulse1` is the only genuine couple,
    // the one holding the two bodies at a fixed relative angle.
    const axisImpulse = joint.impulse2 + ((joint as Physics2DPrismaticJoint).motorImpulse ?? 0);
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0 * state[2] + axisImpulse * state[0],
      joint.impulse0 * state[3] + axisImpulse * state[1],
      joint.impulse1,
      inverseTimestep,
      out,
    );
  },
};

// Couples two independently suspended anchor lengths through a fixed ratio. The two ground anchors are
// world-space points and absorb the reaction, so each body's impulse is applied toward its own ground
// point rather than as an equal-and-opposite pair between the bodies.
export const physics2DPulleyJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPulleyImpulse(bodyA, bodyB, joint, state[0], state[1], state[2], state[3], state[6], joint.impulse0);
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
  },

  swapEnds(joint: Physics2DJoint): boolean {
    const pulley = joint as Physics2DPulleyJoint;
    if (Math.abs(pulley.ratio) < EPSILON) return false;
    const ratio = pulley.ratio;
    const groundX = pulley.groundAnchorAX;
    const groundY = pulley.groundAnchorAY;
    pulley.groundAnchorAX = pulley.groundAnchorBX;
    pulley.groundAnchorAY = pulley.groundAnchorBY;
    pulley.groundAnchorBX = groundX;
    pulley.groundAnchorBY = groundY;
    pulley.ratio = 1 / ratio;
    pulley.constant /= ratio;
    joint.impulse0 = (joint.impulse0 ?? 0) * ratio;
    return true;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const pulley = joint as Physics2DPulleyJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const anchorAX = bodyA.x + joint.rAX;
    const anchorAY = bodyA.y + joint.rAY;
    const anchorBX = bodyB.x + joint.rBX;
    const anchorBY = bodyB.y + joint.rBY;
    const deltaAX = anchorAX - pulley.groundAnchorAX;
    const deltaAY = anchorAY - pulley.groundAnchorAY;
    const deltaBX = anchorBX - pulley.groundAnchorBX;
    const deltaBY = anchorBY - pulley.groundAnchorBY;
    const lengthA = Math.sqrt(deltaAX * deltaAX + deltaAY * deltaAY);
    const lengthB = Math.sqrt(deltaBX * deltaBX + deltaBY * deltaBY);
    const unitAX = lengthA > EPSILON ? deltaAX / lengthA : 0;
    const unitAY = lengthA > EPSILON ? deltaAY / lengthA : 1;
    const unitBX = lengthB > EPSILON ? deltaBX / lengthB : 0;
    const unitBY = lengthB > EPSILON ? deltaBY / lengthB : 1;
    const crossA = joint.rAX * unitAY - joint.rAY * unitAX;
    const crossB = joint.rBX * unitBY - joint.rBY * unitBX;
    const ratioSquared = pulley.ratio * pulley.ratio;
    const denominator =
      bodyA.inverseMass +
      bodyA.inverseInertia * crossA * crossA +
      ratioSquared * (bodyB.inverseMass + bodyB.inverseInertia * crossB * crossB);
    const state = beginJointSolve(pulley, 7);
    state[0] = unitAX;
    state[1] = unitAY;
    state[2] = unitBX;
    state[3] = unitBY;
    state[4] = denominator > 0 ? 1 / denominator : 0;
    state[5] = (lengthA + pulley.ratio * lengthB - pulley.constant) * (BAUMGARTE / dt);
    state[6] = pulley.ratio;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    const velocityA = pulleyAnchorVelocity(bodyA, joint.rAX, joint.rAY, state[0], state[1]);
    const velocityB = pulleyAnchorVelocity(bodyB, joint.rBX, joint.rBY, state[2], state[3]);
    const lambda = -state[4] * (velocityA + state[6] * velocityB + state[5]);
    joint.impulse0 += lambda;
    applyPulleyImpulse(bodyA, bodyB, joint, state[0], state[1], state[2], state[3], state[6], lambda);
  },
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // Body B is pulled along ITS OWN rope segment, toward its own ground anchor — not toward body A.
    // The two ends of a pulley are coupled through the rope rather than acting on each other, so this
    // reaction is not the negative of body A's; the ground anchors take the difference. The ratio is
    // the mechanical advantage on B's segment and multiplies the tension it sees.
    const impulse = joint.impulse0 * state[6];
    return writePhysics2DReactionFromImpulses(joint, impulse * state[2], impulse * state[3], 0, inverseTimestep, out);
  },
};

// Pins two bodies at a point, leaving rotation free — a hinge.
//
// Two scalar constraints, one per axis of the shared point, solved as a coupled pair rather than
// independently: solving x then y lets each undo part of the other's correction, and a hinge under load
// visibly creeps.
export const physics2DRevoluteJointSolver = {
  scaleAccumulatedImpulses(joint: Physics2DJoint, timestepRatio: number): void {
    const revolute = joint as Physics2DRevoluteJoint;
    revolute.motorImpulse = (revolute.motorImpulse ?? 0) * timestepRatio;
  },

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
    // Read plainly, because `prepare` has already established the accumulator and runs before this on
    // every path. Defaulting again here would be a second owner for one invariant — and the version of
    // that defense which shipped read into a LOCAL without writing the field back, so the very next read
    // in `solve` saw the absent value again. A default that does not persist is not a fix.
    const revolute = joint as Physics2DRevoluteJoint;
    const motorImpulse = revolute.motorImpulse;
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
    // Defaulted BEFORE the negation, not after. This runs when the joint is added, ahead of the first
    // prepare, so the field may still be absent — and `-undefined` is NaN, which is not nullish, so a
    // later `??` would accept the poison rather than replace it. Negating an absent accumulator has to
    // produce zero, not NaN.
    revolute.motorImpulse = -(revolute.motorImpulse ?? 0);
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
    // The motor accumulator is revolute-specific, so the shared entry point above cannot reach it.
    revolute.motorImpulse ??= 0;
    const revoluteState = beginJointSolve(joint, 7);
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
    const state = jointSolveStates.get(joint);
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
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // The hinge itself is a pure force at the anchor: `impulse0`/`impulse1` are already world x and y.
    // Everything angular is bolted on beside it — the motor, and the two one-sided limits, whose signs
    // are OPPOSITE because the lower end pushes the relative angle up and the upper end pushes it down.
    const limitImpulse = state[3] - state[4];
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0,
      joint.impulse1,
      ((joint as Physics2DRevoluteJoint).motorImpulse ?? 0) + limitImpulse,
      inverseTimestep,
      out,
    );
  },
};

// An inequality constraint that acts only at full extension. Slack within `maxLength`, caught at it.
//
// The non-negative clamp on the accumulated impulse is what makes it a rope rather than a stiff bar: a
// rope may pull the bodies together and may never push them apart.
export const physics2DRopeJointSolver = {
  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
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
    const inverseMass = axisInverseEffectiveMass(bodyA, bodyB, joint, unitX, unitY);
    const excess = length - rope.maxLength;
    // Slack: no constraint at all this step, which is what a rope IS. Marked by a zero effective mass so
    // the iterations skip it without a second flag to keep in sync.
    const active = excess > 0;
    const ropeState = beginJointSolve(rope, 5);
    ropeState[0] = active && inverseMass > 0 ? 1 / inverseMass : 0;
    ropeState[1] = active ? excess * (BAUMGARTE / dt) : 0;
    ropeState[2] = 0;
    ropeState[3] = unitX;
    ropeState[4] = unitY;
    if (!active) joint.impulse0 = 0;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
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
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // One-sided, so this reports zero for every step the rope spends slack — which is the honest
    // answer and the one a breakable rope needs: a rope that is not taut is carrying no load.
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0 * state[3],
      joint.impulse0 * state[4],
      0,
      inverseTimestep,
      out,
    );
  },
};

// Keeps two anchors on a suspension axis while allowing relative rotation. The lateral constraint is
// rigid; travel along the axis is free when frequencyHz is zero and becomes a damped spring otherwise.
export const physics2DWheelJointSolver = {
  scaleAccumulatedImpulses(joint: Physics2DJoint, timestepRatio: number): void {
    const wheel = joint as Physics2DWheelJoint;
    wheel.motorImpulse = (wheel.motorImpulse ?? 0) * timestepRatio;
  },

  warmStart(world: Physics2DWorld, joint: Physics2DJoint): void {
    const wheel = joint as Physics2DWheelJoint;
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    applyPrismaticImpulse(
      bodyA,
      bodyB,
      state[0],
      state[1],
      state[2],
      state[3],
      state[4],
      state[5],
      state[6],
      state[7],
      joint.impulse0,
      0,
      joint.impulse1,
    );
    if (wheel.motorImpulse !== 0) {
      bodyA.angularVelocity -= bodyA.inverseInertia * wheel.motorImpulse;
      bodyB.angularVelocity += bodyB.inverseInertia * wheel.motorImpulse;
    }
  },

  clearAccumulatedImpulses(joint: Physics2DJoint): void {
    joint.impulse0 = 0;
    joint.impulse1 = 0;
    joint.impulse2 = 0;
    (joint as Physics2DWheelJoint).motorImpulse = 0;
  },

  // Unlike a prismatic joint, a wheel leaves relative rotation free. Expressing body A's axis in body
  // B's local frame therefore needs the bodies' CURRENT angles, which the registry's descriptor-only
  // swap seam does not receive. Preserve authored ends instead of pretending a stale reference frame
  // can canonicalize them.
  swapEnds(): boolean {
    return false;
  },

  prepare(world: Physics2DWorld, joint: Physics2DJoint, dt: number): void {
    const wheel = joint as Physics2DWheelJoint;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;
    writeJointAnchors(bodyA, bodyB, joint);

    const localLength = Math.sqrt(wheel.localAxisAX * wheel.localAxisAX + wheel.localAxisAY * wheel.localAxisAY);
    const localAxisX = localLength > EPSILON ? wheel.localAxisAX / localLength : 1;
    const localAxisY = localLength > EPSILON ? wheel.localAxisAY / localLength : 0;
    const cos = Math.cos(bodyA.angle);
    const sin = Math.sin(bodyA.angle);
    const axisX = localAxisX * cos - localAxisY * sin;
    const axisY = localAxisX * sin + localAxisY * cos;
    const perpendicularX = -axisY;
    const perpendicularY = axisX;
    const distanceX = bodyB.x + joint.rBX - (bodyA.x + joint.rAX);
    const distanceY = bodyB.y + joint.rBY - (bodyA.y + joint.rAY);
    const s1 = (distanceX + joint.rAX) * perpendicularY - (distanceY + joint.rAY) * perpendicularX;
    const s2 = joint.rBX * perpendicularY - joint.rBY * perpendicularX;
    const a1 = (distanceX + joint.rAX) * axisY - (distanceY + joint.rAY) * axisX;
    const a2 = joint.rBX * axisY - joint.rBY * axisX;
    const lateralDenominator =
      bodyA.inverseMass + bodyB.inverseMass + bodyA.inverseInertia * s1 * s1 + bodyB.inverseInertia * s2 * s2;
    const axisDenominator =
      bodyA.inverseMass + bodyB.inverseMass + bodyA.inverseInertia * a1 * a1 + bodyB.inverseInertia * a2 * a2;
    const translation = distanceX * axisX + distanceY * axisY;

    let springMass = 0;
    let gamma = 0;
    let springBias = 0;
    if (wheel.frequencyHz > 0 && axisDenominator > 0) {
      // A zero frequency disables the suspension row outright below rather than stiffening it, so the
      // hard fallback is unreachable from here.
      writePhysics2DSoftRowParameters(
        1 / axisDenominator,
        wheel.frequencyHz,
        wheel.dampingRatio,
        dt,
        0,
        softRowScratch,
      );
      springMass = softRowScratch[0];
      springBias = (translation - wheel.restTranslation) * softRowScratch[1];
      gamma = softRowScratch[2];
    } else {
      joint.impulse1 = 0;
    }

    const inverseInertia = bodyA.inverseInertia + bodyB.inverseInertia;
    const state = beginJointSolve(wheel, 15);
    state[0] = axisX;
    state[1] = axisY;
    state[2] = perpendicularX;
    state[3] = perpendicularY;
    state[4] = s1;
    state[5] = s2;
    state[6] = a1;
    state[7] = a2;
    state[8] = lateralDenominator > 0 ? 1 / lateralDenominator : 0;
    state[9] = springMass;
    state[10] = gamma;
    state[11] = (distanceX * perpendicularX + distanceY * perpendicularY) * (BAUMGARTE / dt);
    state[12] = springBias;
    state[13] = inverseInertia > 0 ? 1 / inverseInertia : 0;
    state[14] = Math.max(0, dt * wheel.maxMotorTorque);
    wheel.motorImpulse ??= 0;
    if (wheel.enableMotor) {
      wheel.motorImpulse = Math.min(Math.max(wheel.motorImpulse, -state[14]), state[14]);
    } else {
      wheel.motorImpulse = 0;
    }
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const wheel = joint as Physics2DWheelJoint;
    const state = jointSolveStates.get(joint);
    if (state === undefined) return;
    const bodyA = findPhysics2DBody(world, joint.bodyA);
    const bodyB = findPhysics2DBody(world, joint.bodyB);
    if (bodyA === null || bodyB === null) return;

    if (wheel.enableMotor && state[13] > 0) {
      const desired = -state[13] * (bodyB.angularVelocity - bodyA.angularVelocity - wheel.motorSpeed);
      const previous = wheel.motorImpulse;
      wheel.motorImpulse = Math.min(Math.max(previous + desired, -state[14]), state[14]);
      const applied = wheel.motorImpulse - previous;
      bodyA.angularVelocity -= bodyA.inverseInertia * applied;
      bodyB.angularVelocity += bodyB.inverseInertia * applied;
    }

    if (state[9] > 0) {
      const velocity = prismaticAxisVelocity(bodyA, bodyB, state[0], state[1], state[6], state[7]);
      const lambda = -state[9] * (velocity + state[12] + state[10] * joint.impulse1);
      joint.impulse1 += lambda;
      applyPrismaticImpulse(
        bodyA,
        bodyB,
        state[0],
        state[1],
        state[2],
        state[3],
        state[4],
        state[5],
        state[6],
        state[7],
        0,
        0,
        lambda,
      );
    }

    const lateralVelocity =
      (bodyB.velocityX - bodyA.velocityX) * state[2] +
      (bodyB.velocityY - bodyA.velocityY) * state[3] +
      state[5] * bodyB.angularVelocity -
      state[4] * bodyA.angularVelocity;
    const lateralImpulse = -state[8] * (lateralVelocity + state[11]);
    joint.impulse0 += lateralImpulse;
    applyPrismaticImpulse(
      bodyA,
      bodyB,
      state[0],
      state[1],
      state[2],
      state[3],
      state[4],
      state[5],
      state[6],
      state[7],
      lateralImpulse,
      0,
      0,
    );
  },
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // A wheel leaves relative rotation free, so unlike the prismatic rail it has no angular constraint
    // lane at all and its only couple is the drive motor. `impulse0` is the lateral grip that keeps the
    // wheel from sliding sideways; `impulse1` is the suspension load along the axis, which is the one a
    // caller usually wants.
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0 * state[2] + joint.impulse1 * state[0],
      joint.impulse0 * state[3] + joint.impulse1 * state[1],
      (joint as Physics2DWheelJoint).motorImpulse ?? 0,
      inverseTimestep,
      out,
    );
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
    const weldState = beginJointSolve(weld, 5);
    weldState[0] = errorX * (BAUMGARTE / dt);
    weldState[1] = errorY * (BAUMGARTE / dt);
    weldState[2] = angleError * (BAUMGARTE / dt);
    weldState[3] = angularMass > 0 ? 1 / angularMass : 0;
    weldState[4] = 0;
  },

  solve(world: Physics2DWorld, joint: Physics2DJoint): void {
    const state = jointSolveStates.get(joint);
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
  writeReaction(
    _world: Readonly<Physics2DWorld>,
    joint: Readonly<Physics2DJoint>,
    inverseTimestep: number,
    out: Physics2DJointReaction,
  ): boolean {
    const state = jointSolveStates.get(joint);
    if (state === undefined) return false;
    // The one built-in kind that resists both ways at once, which is why it is the natural thing to
    // make breakable: `impulse0`/`impulse1` hold the anchors together and `impulse2` holds the angle.
    return writePhysics2DReactionFromImpulses(
      joint,
      joint.impulse0,
      joint.impulse1,
      joint.impulse2,
      inverseTimestep,
      out,
    );
  },
};

// Scales one kind's total impulse on body B into the reaction pair, and is the single place the
// impulse-to-force conversion happens.
//
// Callers pass the couple ALREADY separated from the anchor force, and every built-in kind can do that
// by inspection rather than by arithmetic: each of the three shared appliers (`applyPhysics2DImpulse`,
// `applyPrismaticImpulse`, `applyPulleyImpulse`) gives body B exactly `rB x F` of angular impulse for the
// linear impulse it delivers, so a kind's couple is whatever it wrote to `bodyB.angularVelocity` BESIDES
// that — a motor, a limit, an angle constraint — and zero for the kinds that only pull along a line.
// That is why there are not nine torque formulas here, and why a new kind's author has one short
// question to answer rather than a derivation to redo.
function writePhysics2DReactionFromImpulses(
  joint: Readonly<Physics2DJoint>,
  linearX: number,
  linearY: number,
  angular: number,
  inverseTimestep: number,
  out: Physics2DJointReaction,
): boolean {
  out.forceX = linearX * inverseTimestep;
  out.forceY = linearY * inverseTimestep;
  out.torque = angular * inverseTimestep;
  return true;
}

function writeGearJacobian(
  kind: Physics2DGearJoint['coordinateA'],
  axisX: number,
  axisY: number,
  rX: number,
  rY: number,
  state: number[],
  offset: number,
): void {
  if (kind === 'angular') {
    state[offset] = 0;
    state[offset + 1] = 0;
    state[offset + 2] = 1;
    return;
  }
  const length = Math.sqrt(axisX * axisX + axisY * axisY);
  const unitX = length > EPSILON ? axisX / length : 1;
  const unitY = length > EPSILON ? axisY / length : 0;
  state[offset] = unitX;
  state[offset + 1] = unitY;
  state[offset + 2] = rX * unitY - rY * unitX;
}

function gearCoordinate(
  body: Readonly<RigidBody2D>,
  rX: number,
  rY: number,
  kind: Physics2DGearJoint['coordinateA'],
  axisX: number,
  axisY: number,
): number {
  if (kind === 'angular') return body.angle;
  return (body.x + rX) * axisX + (body.y + rY) * axisY;
}

function applyGearImpulse(bodyA: RigidBody2D, bodyB: RigidBody2D, state: Readonly<number[]>, impulse: number): void {
  bodyA.velocityX += bodyA.inverseMass * state[0] * impulse;
  bodyA.velocityY += bodyA.inverseMass * state[1] * impulse;
  bodyA.angularVelocity += bodyA.inverseInertia * state[2] * impulse;
  const impulseB = impulse * state[8];
  bodyB.velocityX += bodyB.inverseMass * state[3] * impulseB;
  bodyB.velocityY += bodyB.inverseMass * state[4] * impulseB;
  bodyB.angularVelocity += bodyB.inverseInertia * state[5] * impulseB;
}

function applyPrismaticImpulse(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  axisX: number,
  axisY: number,
  perpendicularX: number,
  perpendicularY: number,
  s1: number,
  s2: number,
  a1: number,
  a2: number,
  perpendicularImpulse: number,
  angularImpulse: number,
  axisImpulse: number,
): void {
  const impulseX = perpendicularImpulse * perpendicularX + axisImpulse * axisX;
  const impulseY = perpendicularImpulse * perpendicularY + axisImpulse * axisY;
  bodyA.velocityX -= bodyA.inverseMass * impulseX;
  bodyA.velocityY -= bodyA.inverseMass * impulseY;
  bodyA.angularVelocity -= bodyA.inverseInertia * (perpendicularImpulse * s1 + axisImpulse * a1 + angularImpulse);
  bodyB.velocityX += bodyB.inverseMass * impulseX;
  bodyB.velocityY += bodyB.inverseMass * impulseY;
  bodyB.angularVelocity += bodyB.inverseInertia * (perpendicularImpulse * s2 + axisImpulse * a2 + angularImpulse);
}

function prismaticAxisVelocity(
  bodyA: Readonly<RigidBody2D>,
  bodyB: Readonly<RigidBody2D>,
  axisX: number,
  axisY: number,
  a1: number,
  a2: number,
): number {
  return (
    (bodyB.velocityX - bodyA.velocityX) * axisX +
    (bodyB.velocityY - bodyA.velocityY) * axisY +
    a2 * bodyB.angularVelocity -
    a1 * bodyA.angularVelocity
  );
}

function pulleyAnchorVelocity(
  body: Readonly<RigidBody2D>,
  rX: number,
  rY: number,
  unitX: number,
  unitY: number,
): number {
  const velocityX = body.velocityX - body.angularVelocity * rY;
  const velocityY = body.velocityY + body.angularVelocity * rX;
  return velocityX * unitX + velocityY * unitY;
}

function applyPulleyImpulse(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  joint: Readonly<Physics2DJoint>,
  unitAX: number,
  unitAY: number,
  unitBX: number,
  unitBY: number,
  ratio: number,
  impulse: number,
): void {
  const impulseAX = impulse * unitAX;
  const impulseAY = impulse * unitAY;
  const impulseB = impulse * ratio;
  const impulseBX = impulseB * unitBX;
  const impulseBY = impulseB * unitBY;
  bodyA.velocityX += bodyA.inverseMass * impulseAX;
  bodyA.velocityY += bodyA.inverseMass * impulseAY;
  bodyA.angularVelocity += bodyA.inverseInertia * (joint.rAX * impulseAY - joint.rAY * impulseAX);
  bodyB.velocityX += bodyB.inverseMass * impulseBX;
  bodyB.velocityY += bodyB.inverseMass * impulseBY;
  bodyB.angularVelocity += bodyB.inverseInertia * (joint.rBX * impulseBY - joint.rBY * impulseBX);
}

// The shared two-axis point solve behind revolute and weld. Each axis is solved against the velocities the
// other just left, which is the sequential-impulse property doing its job within one constraint.
function solvePointConstraint(
  bodyA: RigidBody2D,
  bodyB: RigidBody2D,
  joint: Physics2DJoint,
  biasX: number,
  biasY: number,
): void {
  const inverseMassX = axisInverseEffectiveMass(bodyA, bodyB, joint, 1, 0);
  const velocityX = axisRelativeVelocity(bodyA, bodyB, joint, 1, 0);
  const lambdaX = inverseMassX > 0 ? -(velocityX + biasX) / inverseMassX : 0;
  joint.impulse0 += lambdaX;
  applyPhysics2DImpulse(bodyA, bodyB, joint.rAX, joint.rAY, joint.rBX, joint.rBY, -lambdaX, 0);

  const inverseMassY = axisInverseEffectiveMass(bodyA, bodyB, joint, 0, 1);
  const velocityY = axisRelativeVelocity(bodyA, bodyB, joint, 0, 1);
  const lambdaY = inverseMassY > 0 ? -(velocityY + biasY) / inverseMassY : 0;
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

// The pair's INVERSE effective mass along `axis` at the joint anchors — the same quantity a contact
// constraint uses, over the joint's lever arms instead of a contact point's. Every caller divides by it
// or reciprocates it; nothing may use it as a mass. The name says `Inverse` because the previous one did
// not, and a spring built on it silently authored the wrong stiffness for years.
function axisInverseEffectiveMass(
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
// Entry point for one joint's step: sizes its per-step scratch and ESTABLISHES its impulse accumulators.
//
// The accumulators are established here rather than defended at each read because every read assumed the
// field was already a number, and a joint can reach the solver without one. The type declares them
// required, but a joint deserialized from a saved world satisfies that only at compile time; at runtime
// the fields are simply absent. The first read then computes `undefined + x`, and because an accumulator
// is fed back into the next iteration the NaN does not stay local — it goes out through the applied
// impulse into BOTH bodies' velocities, and from there into every contact they touch.
//
// This is the one place that covers the whole class. Every solver's `prepare` calls it, and `solve`
// returns early when the scratch is absent, so no solver can read an accumulator this has not passed
// over first. Kind-specific accumulators (the revolute motor) are established by their own `prepare`,
// which is the only code that knows they exist.
function beginJointSolve(joint: Physics2DJoint, length: number): number[] {
  joint.impulse0 ??= 0;
  joint.impulse1 ??= 0;
  joint.impulse2 ??= 0;
  let state = jointSolveStates.get(joint);
  if (state === undefined) {
    state = [];
    jointSolveStates.set(joint, state);
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
const jointSolveStates = new WeakMap<Physics2DJoint, number[]>();
const DEFAULT_MOUSE_FREQUENCY_HZ = 5;

const EPSILON = 1e-9;
// The fraction of a joint's positional error corrected per step. Matches the contact solver's rationale:
// correcting all of it at once turns a deep error into an explosion.
const BAUMGARTE = 0.2;

// Reused across every joint prepared this step: `prepare` runs in one synchronous pass per solver and
// reads these three numbers out before the next call, and the world already rejects a recursive step.
const softRowScratch = [0, 0, 0];
