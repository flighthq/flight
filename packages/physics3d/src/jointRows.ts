import type { Physics3DJoint, Physics3DJointFrames, RigidBody3D } from '@flighthq/types/contract';

import {
  applyPhysics3DJointAngularImpulse,
  applyPhysics3DJointImpulse,
  applyPhysics3DJointRowImpulse,
  getPhysics3DJointRowMass,
  getPhysics3DJointRowVelocity,
  writePhysics3DJointAnchorVelocity,
  writePhysics3DJointAnchors,
  writePhysics3DJointAngularMass,
  writePhysics3DJointFrameBasis,
  writePhysics3DJointFrameRotation,
  writePhysics3DJointPointMass,
  writePhysics3DJointRotationError,
  writePhysics3DJointSeparation,
} from './jointMath';
import { applySymmetricTensor, inverseSymmetricTensor } from './symmetricTensor';

// The constraint FAMILIES every 3D joint kind is composed from. `jointMath` is the arithmetic; this is the
// sequential-impulse pattern applied to it — prepare a block, warm-start it, solve it — so a kind reads as a
// list of the constraints it imposes rather than as a page of index arithmetic.
//
// Package-internal, and layered: `jointMath` knows nothing about per-step state, this file owns the layout
// of that state, and `joints` composes these into kinds.
//
// A CONSTRAINT ROW is nine consecutive numbers in a joint's per-step state: the linear direction, then the
// angular arm on A, then the angular arm on B. Storing the three vectors as one block is what lets a row's
// mass, velocity, and impulse be addressed as `(state, offset)` rather than as nine arguments repeated at
// every call site — and it is why a row's three readings can never quietly describe different constraints.
// A PURELY ANGULAR row is one whose direction is zero and whose two arms are the axis it turns about.

// The width of one constraint row in a joint's per-step state.
export const ROW_LENGTH = 9;

// The three-number blocks a point constraint occupies at the start of a joint's state: the inverted 3x3
// effective mass, then the positional bias.
export const POINT_MASS = 0;
export const POINT_BIAS = 6;
export const POINT_LENGTH = 9;

// Applies one row's impulse.
export function applyRow(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  state: readonly number[],
  offset: number,
  impulse: number,
): void {
  if (impulse === 0) return;
  applyPhysics3DJointRowImpulse(
    bodyA,
    bodyB,
    state[offset],
    state[offset + 1],
    state[offset + 2],
    state[offset + 3],
    state[offset + 4],
    state[offset + 5],
    state[offset + 6],
    state[offset + 7],
    state[offset + 8],
    impulse,
  );
}

// Establishes a joint's impulse accumulators and returns its reusable per-step scratch, sized to `length`.
//
// The accumulators are established HERE rather than defended at each read, because every read assumes the
// field is already a number and a joint can reach a solver without one: the type declares them required, but
// a joint reconstructed from a saved world satisfies that only at compile time. The first read then computes
// `undefined + x`, and because an accumulator feeds the next iteration the NaN does not stay local — it goes
// out through the applied impulse into both bodies' velocities and from there into every contact they touch.
//
// The scratch array is reused rather than reallocated. Every solver rebuilds its whole block each substep, so
// it is pure destination; allocating a fresh one per joint per step made the step's allocation profile scale
// with the joint count, which is the hidden per-frame allocation this package's charter forbids.
export function beginJointSolve(joint: Physics3DJoint, length: number): number[] {
  joint.impulse0 ??= 0;
  joint.impulse1 ??= 0;
  joint.impulse2 ??= 0;
  joint.impulse3 ??= 0;
  joint.impulse4 ??= 0;
  joint.impulse5 ??= 0;
  let state = jointSolveStates.get(joint);
  if (state === undefined) {
    state = [];
    jointSolveStates.set(joint, state);
  }
  state.length = length;
  return state;
}

// Discards a joint's per-step state, so a `solve` after a `prepare` that could not run finds nothing rather
// than the previous step's numbers. A prepare bails when a body index no longer resolves, and without this
// the stale block would be applied against whichever bodies did resolve — an impulse computed for a pair
// that no longer exists.
export function clearJointSolve(joint: Physics3DJoint): void {
  jointSolveStates.delete(joint);
}

// A joint's per-step state, or undefined when it has none. A `solve` reads this and returns early on
// undefined, which is what makes a bailed `prepare` mean "this joint does nothing this step".
export function getJointSolveState(joint: Readonly<Physics3DJoint>): number[] | undefined {
  return jointSolveStates.get(joint as Physics3DJoint);
}

// The scalar effective mass of one row, or 0 when the pair cannot move along it.
export function getRowMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  state: readonly number[],
  offset: number,
): number {
  return getPhysics3DJointRowMass(
    bodyA,
    bodyB,
    state[offset],
    state[offset + 1],
    state[offset + 2],
    state[offset + 3],
    state[offset + 4],
    state[offset + 5],
    state[offset + 6],
    state[offset + 7],
    state[offset + 8],
  );
}

// The rate one row's coordinate is changing, B relative to A.
export function getRowVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  state: readonly number[],
  offset: number,
): number {
  return getPhysics3DJointRowVelocity(
    bodyA,
    bodyB,
    state[offset],
    state[offset + 1],
    state[offset + 2],
    state[offset + 3],
    state[offset + 4],
    state[offset + 5],
    state[offset + 6],
    state[offset + 7],
    state[offset + 8],
  );
}

// Builds the three-row angular lock: the inverted sum of the two world inverse inertia tensors, and the bias
// that rotates frame B back onto frame A. Reads the frames left by `readFrameRotations`.
export function prepareAngularBlock(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  state: number[],
  massOffset: number,
  biasOffset: number,
  dt: number,
): void {
  writePhysics3DJointAngularMass(bodyA, bodyB, blockTensor);
  inverseSymmetricTensor(blockTensor, blockInverse);
  writeBlock(state, massOffset, blockInverse);

  writePhysics3DJointRotationError(
    frameARotation[0],
    frameARotation[1],
    frameARotation[2],
    frameARotation[3],
    frameBRotation[0],
    frameBRotation[1],
    frameBRotation[2],
    frameBRotation[3],
    blockVector,
  );
  const bias = BAUMGARTE / dt;
  state[biasOffset] = blockVector[0] * bias;
  state[biasOffset + 1] = blockVector[1] * bias;
  state[biasOffset + 2] = blockVector[2] * bias;
}

// Builds the three-row point constraint: the lever arms, the inverted 3x3 effective mass, and the bias that
// pulls the two anchors back together. Occupies `POINT_MASS` through `POINT_BIAS` at the head of the state.
export function preparePointBlock(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  joint: Physics3DJoint,
  state: number[],
  dt: number,
): void {
  writePhysics3DJointAnchors(bodyA, bodyB, joint);
  writePhysics3DJointPointMass(
    bodyA,
    bodyB,
    joint.rAX,
    joint.rAY,
    joint.rAZ,
    joint.rBX,
    joint.rBY,
    joint.rBZ,
    blockTensor,
  );
  inverseSymmetricTensor(blockTensor, blockInverse);
  writeBlock(state, POINT_MASS, blockInverse);

  writePhysics3DJointSeparation(bodyA, bodyB, joint, blockVector);
  const bias = BAUMGARTE / dt;
  state[POINT_BIAS] = blockVector[0] * bias;
  state[POINT_BIAS + 1] = blockVector[1] * bias;
  state[POINT_BIAS + 2] = blockVector[2] * bias;
}

// The world-space axes of both bodies' joint frames, left in `frameABasis` and `frameBBasis`. Each is nine
// numbers, column-major: X axis, then Y, then Z.
export function readFrameBases(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  frames: Physics3DJointFrames,
): void {
  establishFrames(frames);
  writePhysics3DJointFrameBasis(
    bodyA,
    frames.localRotationAX,
    frames.localRotationAY,
    frames.localRotationAZ,
    frames.localRotationAW,
    frameABasis,
  );
  writePhysics3DJointFrameBasis(
    bodyB,
    frames.localRotationBX,
    frames.localRotationBY,
    frames.localRotationBZ,
    frames.localRotationBW,
    frameBBasis,
  );
}

// Both bodies' joint frames as world-space quaternions, left in `frameARotation` and `frameBRotation`.
export function readFrameRotations(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  frames: Physics3DJointFrames,
): void {
  establishFrames(frames);
  writePhysics3DJointFrameRotation(
    bodyA,
    frames.localRotationAX,
    frames.localRotationAY,
    frames.localRotationAZ,
    frames.localRotationAW,
    frameARotation,
  );
  writePhysics3DJointFrameRotation(
    bodyB,
    frames.localRotationBX,
    frames.localRotationBY,
    frames.localRotationBZ,
    frames.localRotationBW,
    frameBRotation,
  );
}

// Reads one of the six common accumulators by index, for the kinds whose rows are numbered rather than named.
export function readJointImpulse(joint: Readonly<Physics3DJoint>, slot: number): number {
  switch (slot) {
    case 0:
      return joint.impulse0;
    case 1:
      return joint.impulse1;
    case 2:
      return joint.impulse2;
    case 3:
      return joint.impulse3;
    case 4:
      return joint.impulse4;
    default:
      return joint.impulse5;
  }
}

// Solves the three angular lock rows as one coupled block, accumulating into `impulse3` through `impulse5`.
export function solveAngularBlock(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  joint: Physics3DJoint,
  state: readonly number[],
  massOffset: number,
  biasOffset: number,
): void {
  readBlock(state, massOffset, blockTensor);
  applySymmetricTensor(
    blockTensor,
    bodyB.angularVelocityX - bodyA.angularVelocityX + state[biasOffset],
    bodyB.angularVelocityY - bodyA.angularVelocityY + state[biasOffset + 1],
    bodyB.angularVelocityZ - bodyA.angularVelocityZ + state[biasOffset + 2],
    blockResult,
  );

  const impulseX = -blockResult[0];
  const impulseY = -blockResult[1];
  const impulseZ = -blockResult[2];
  joint.impulse3 += impulseX;
  joint.impulse4 += impulseY;
  joint.impulse5 += impulseZ;
  applyPhysics3DJointAngularImpulse(bodyA, bodyB, impulseX, impulseY, impulseZ);
}

// Solves one equality row — a coordinate held at exactly its target — accumulating into a common slot.
export function solveEqualityRow(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  joint: Physics3DJoint,
  slot: number,
  state: readonly number[],
  offset: number,
  mass: number,
  error: number,
  biasFactor: number,
): void {
  const velocity = getRowVelocity(bodyA, bodyB, state, offset);
  const impulse = -mass * (velocity + error * biasFactor);
  writeJointImpulse(joint, slot, readJointImpulse(joint, slot) + impulse);
  applyRow(bodyA, bodyB, state, offset, impulse);
}

// Holds a row's coordinate at or above its lower bound. `error` is the SIGNED distance above the bound —
// positive inside the interval, negative once the bound has been crossed.
//
// The non-negative clamp on the ACCUMULATED impulse is what makes this a limit rather than a spring: it may
// push the coordinate back up through the bound and may never pull it down.
//
// The bias uses the signed error with no clamp, and both clamps are wrong in opposite ways. `max(error, 0)`
// suppresses correctly but cannot correct: it zeroes the bias exactly when the bound has been crossed, so a
// joint authored out of range and sitting still is never pushed back. `min(error, 0)` corrects but cannot
// suppress: it zeroes the bias while INSIDE the interval, and the row then brakes any approach to the bound
// from a distance — a motor at speed held at a standstill by a limit it was nowhere near.
// `gamma` is the row's COMPLIANCE, zero for a hard stop. It multiplies the ACCUMULATED impulse rather
// than this iteration's, because a soft constraint is one that gives way in proportion to how hard it
// has already been pushing — a statement about the total, not the increment. The non-negative clamp
// survives softening untouched: a compliant stop still may only push back through the bound.
export function solveLowerLimitRow(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  state: number[],
  offset: number,
  mass: number,
  error: number,
  biasFactor: number,
  accumulatorSlot: number,
  gamma = 0,
): void {
  const velocity = getRowVelocity(bodyA, bodyB, state, offset);
  const previous = state[accumulatorSlot];
  const total = Math.max(previous - mass * (velocity + error * biasFactor + gamma * previous), 0);
  state[accumulatorSlot] = total;
  applyRow(bodyA, bodyB, state, offset, total - previous);
}

// Drives a row's coordinate toward `speed`, spending at most `maxImpulse`, and returns the new accumulated
// motor impulse for the caller to store on its kind-specific field.
//
// Clamped on the ACCUMULATED impulse rather than per iteration, so the bound is a force or a torque. A
// per-iteration clamp would scale the motor's real strength with the iteration count, which presents as a
// motor that gets stronger when the solver is tuned for accuracy.
export function solveMotorRow(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  state: readonly number[],
  offset: number,
  mass: number,
  speed: number,
  maxImpulse: number,
  previous: number,
): number {
  const velocity = getRowVelocity(bodyA, bodyB, state, offset);
  const total = Math.min(Math.max(previous - mass * (velocity - speed), -maxImpulse), maxImpulse);
  applyRow(bodyA, bodyB, state, offset, total - previous);
  return total;
}

// Solves the three point rows as one coupled block, accumulating into `impulse0` through `impulse2`.
//
// Coupled rather than solved axis by axis. Solving x, then y, then z lets each undo part of the previous
// correction, and a loaded joint visibly creeps — the 3D form of the same failure a 2D revolute shows when
// its two rows are separated.
export function solvePointBlock(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  joint: Physics3DJoint,
  state: readonly number[],
): void {
  writePhysics3DJointAnchorVelocity(bodyA, bodyB, joint, blockVector);
  readBlock(state, POINT_MASS, blockTensor);
  applySymmetricTensor(
    blockTensor,
    blockVector[0] + state[POINT_BIAS],
    blockVector[1] + state[POINT_BIAS + 1],
    blockVector[2] + state[POINT_BIAS + 2],
    blockResult,
  );

  const impulseX = -blockResult[0];
  const impulseY = -blockResult[1];
  const impulseZ = -blockResult[2];
  joint.impulse0 += impulseX;
  joint.impulse1 += impulseY;
  joint.impulse2 += impulseZ;
  applyPhysics3DJointImpulse(
    bodyA,
    bodyB,
    joint.rAX,
    joint.rAY,
    joint.rAZ,
    joint.rBX,
    joint.rBY,
    joint.rBZ,
    impulseX,
    impulseY,
    impulseZ,
  );
}

// Holds a row's coordinate at or below its upper bound. `error` is the SIGNED distance below the bound —
// positive inside the interval, negative once the bound has been crossed.
//
// The mirror of `solveLowerLimitRow`, reached by reading the row backwards: negating both the velocity and
// the applied impulse turns "at least" into "at most" without a second sign convention to keep straight.
export function solveUpperLimitRow(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  state: number[],
  offset: number,
  mass: number,
  error: number,
  biasFactor: number,
  accumulatorSlot: number,
  gamma = 0,
): void {
  const velocity = -getRowVelocity(bodyA, bodyB, state, offset);
  const previous = state[accumulatorSlot];
  const total = Math.max(previous - mass * (velocity + error * biasFactor + gamma * previous), 0);
  state[accumulatorSlot] = total;
  applyRow(bodyA, bodyB, state, offset, -(total - previous));
}

// Reapplies the angular lock's accumulated impulse before iteration begins.
export function warmStartAngularBlock(bodyA: RigidBody3D, bodyB: RigidBody3D, joint: Readonly<Physics3DJoint>): void {
  applyPhysics3DJointAngularImpulse(bodyA, bodyB, joint.impulse3, joint.impulse4, joint.impulse5);
}

// Reapplies the point constraint's accumulated impulse before iteration begins.
export function warmStartPointBlock(bodyA: RigidBody3D, bodyB: RigidBody3D, joint: Readonly<Physics3DJoint>): void {
  applyPhysics3DJointImpulse(
    bodyA,
    bodyB,
    joint.rAX,
    joint.rAY,
    joint.rAZ,
    joint.rBX,
    joint.rBY,
    joint.rBZ,
    joint.impulse0,
    joint.impulse1,
    joint.impulse2,
  );
}

// Writes a purely angular row: no linear impulse, both arms the axis it turns about. The row's coordinate is
// then the relative rotation angle about that axis.
export function writeAngularRow(state: number[], offset: number, axisX: number, axisY: number, axisZ: number): void {
  writeRow(state, offset, 0, 0, 0, axisX, axisY, axisZ, axisX, axisY, axisZ);
}

// Writes one of the six common accumulators by index.
export function writeJointImpulse(joint: Physics3DJoint, slot: number, value: number): void {
  switch (slot) {
    case 0:
      joint.impulse0 = value;
      break;
    case 1:
      joint.impulse1 = value;
      break;
    case 2:
      joint.impulse2 = value;
      break;
    case 3:
      joint.impulse3 = value;
      break;
    case 4:
      joint.impulse4 = value;
      break;
    default:
      joint.impulse5 = value;
      break;
  }
}

// Derives the three numbers a SOFT constraint row needs from the motion a caller described, writing
// `[mass, biasFactor, gamma]`.
//
// A frequency and a damping ratio describe the motion wanted; stiffness and damping are what the solver
// needs, and converting between them requires the mass being moved. Deriving them here, per-step and
// per-pair, is what makes a 2 Hz spring oscillate at 2 Hz whatever it is attached to — an authored
// stiffness would change frequency the moment either body's mass did.
//
// `biasFactor` is returned in the position a hard row's own bias factor occupies, so a row solves
// identically either way and the only difference between a stop and a spring is which three numbers it
// was handed.
//
// `hardBiasFactor` is what to fall back to when the spring cannot be computed, and it is a PARAMETER
// rather than a constant because the two callers legitimately disagree about it: a two-sided rest row
// corrects at `BAUMGARTE / dt`, while a one-sided limit row corrects fully at `1 / dt`. Baking either
// in would silently change the other's hard behaviour the first time it took this path.
//
// Compliance adds to the INVERSE mass, which is why the returned mass is not a scaled version of the
// input: softening makes a constraint easier to violate, and that is an addition on the reciprocal side.
// A non-positive frequency or timestep returns the HARD parameters, so "spring enabled with no
// frequency set" degrades to the stop it replaced rather than to a constraint that does nothing.
export function writePhysics3DSoftRowParameters(
  mass: number,
  frequencyHz: number,
  dampingRatio: number,
  dt: number,
  hardBiasFactor: number,
  out: number[],
): void {
  if (!(frequencyHz > 0) || !(dt > 0)) {
    out[0] = mass;
    out[1] = hardBiasFactor;
    out[2] = 0;
    return;
  }
  const angular = TAU * frequencyHz;
  const damping = 2 * mass * dampingRatio * angular;
  const stiffness = mass * angular * angular;
  const gammaDenominator = dt * (damping + dt * stiffness);
  const gamma = gammaDenominator > 0 ? 1 / gammaDenominator : 0;
  const inverseMass = mass > 0 ? 1 / mass : 0;
  const softened = inverseMass + gamma;
  out[0] = softened > 0 ? 1 / softened : 0;
  out[1] = dt * stiffness * gamma;
  out[2] = gamma;
}

// Writes one constraint row into a joint's per-step state.
export function writeRow(
  state: number[],
  offset: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  armAX: number,
  armAY: number,
  armAZ: number,
  armBX: number,
  armBY: number,
  armBZ: number,
): void {
  state[offset] = directionX;
  state[offset + 1] = directionY;
  state[offset + 2] = directionZ;
  state[offset + 3] = armAX;
  state[offset + 4] = armAY;
  state[offset + 5] = armAZ;
  state[offset + 6] = armBX;
  state[offset + 7] = armBY;
  state[offset + 8] = armBZ;
}

// Establishes a frame pair's eight components for the same reason `beginJointSolve` establishes the impulse
// accumulators: a reconstructed joint satisfies the required type at compile time only, and an absent
// rotation would multiply through into both bodies as NaN. Four absent components give the identity, which is
// what an author who never set a frame meant.
function establishFrames(frames: Physics3DJointFrames): void {
  frames.localRotationAX ??= 0;
  frames.localRotationAY ??= 0;
  frames.localRotationAZ ??= 0;
  frames.localRotationAW ??= 1;
  frames.localRotationBX ??= 0;
  frames.localRotationBY ??= 0;
  frames.localRotationBZ ??= 0;
  frames.localRotationBW ??= 1;
}

function readBlock(state: readonly number[], offset: number, out: number[]): void {
  out[0] = state[offset];
  out[1] = state[offset + 1];
  out[2] = state[offset + 2];
  out[3] = state[offset + 3];
  out[4] = state[offset + 4];
  out[5] = state[offset + 5];
}

function writeBlock(state: number[], offset: number, source: readonly number[]): void {
  state[offset] = source[0];
  state[offset + 1] = source[1];
  state[offset + 2] = source[2];
  state[offset + 3] = source[3];
  state[offset + 4] = source[4];
  state[offset + 5] = source[5];
}

// The fraction of a joint's positional error corrected per step. Matches the contact solver's rationale:
// correcting all of it at once turns a deep error into an explosion.
const BAUMGARTE = 0.2;
const TAU = 2 * Math.PI;
// The world-space frames the prepare pass leaves for the kind that asked for them. Module scratch rather than
// per-joint state because they are consumed within one `prepare`, never across two.
export const frameABasis = new Array<number>(9).fill(0);
export const frameBBasis = new Array<number>(9).fill(0);
export const frameARotation = [0, 0, 0, 1];
export const frameBRotation = [0, 0, 0, 1];
const blockTensor = [0, 0, 0, 0, 0, 0];
const blockInverse = [0, 0, 0, 0, 0, 0];
const blockVector = [0, 0, 0];
const blockResult = [0, 0, 0];

// Per-step solver state, keyed WEAKLY by joint. A module-global strong Map would retain every joint ever
// prepared for the lifetime of the module: removing a joint from a world drops the world's reference but not
// this one, and there is no deletion hook to forget, because a joint can leave a world without this module
// being told. Keying weakly makes the retention question disappear rather than answering it — the entry goes
// when the joint does, at every exit path, including ones nobody has written yet.
//
// A Map of arrays rather than fields on the joint, because the numbers each kind needs mean different things
// per kind, and a fixed block of untyped scratch on the public entity would make the header describe the
// solver's internals.
const jointSolveStates = new WeakMap<Physics3DJoint, number[]>();
