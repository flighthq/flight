import type { Physics3DJoint, Physics3DJointFrames, RigidBody3D } from '@flighthq/types/contract';

import {
  applySymmetricTensor,
  TENSOR_XX,
  TENSOR_XY,
  TENSOR_XZ,
  TENSOR_YY,
  TENSOR_YZ,
  TENSOR_ZZ,
} from './symmetricTensor';

// The constraint arithmetic every 3D joint kind is assembled from: lever arms, effective-mass blocks,
// frame extraction, and the two impulse appliers.
//
// Package-internal, like `symmetricTensor`. These take and return loose numbers rather than
// `@flighthq/geometry`'s `Quaternion` and `Vector3`, which are `Entity` types over a `Float32Array` — both
// an indirection in a per-iteration loop and a precision step down from what a solver's accumulators need.
// That is also why the quaternion helpers here are private rather than reaching for
// `multiplyQuaternion`/`rotateVector3ByQuaternion`: those operate on the entity form.
//
// ONE SIGN CONVENTION HOLDS THROUGHOUT: every impulse is applied POSITIVE TO B and NEGATIVE TO A, and every
// relative quantity is measured B RELATIVE TO A. So a positive impulse along a direction increases the
// relative velocity along it, and `impulse = -mass * (velocity + bias)` drives the constraint to rest. The
// contact solver uses the opposite sense, because a contact normal points out of B and resolving pushes A
// away; mixing the two is not a small error, because the correction then adds to the violation and
// compounds every iteration.

// Applies an equal and opposite PURE angular impulse: B gains it, A loses it. No linear velocity changes,
// which is what makes it usable for a hinge's axis rows without disturbing the point constraint holding the
// same joint together.
export function applyPhysics3DJointAngularImpulse(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
): void {
  readWorldInverseInertia(bodyA, angularImpulseTensor);
  applySymmetricTensor(angularImpulseTensor, impulseX, impulseY, impulseZ, angularImpulseVector);
  bodyA.angularVelocityX -= angularImpulseVector[0];
  bodyA.angularVelocityY -= angularImpulseVector[1];
  bodyA.angularVelocityZ -= angularImpulseVector[2];

  readWorldInverseInertia(bodyB, angularImpulseTensor);
  applySymmetricTensor(angularImpulseTensor, impulseX, impulseY, impulseZ, angularImpulseVector);
  bodyB.angularVelocityX += angularImpulseVector[0];
  bodyB.angularVelocityY += angularImpulseVector[1];
  bodyB.angularVelocityZ += angularImpulseVector[2];
}

// Applies an equal and opposite linear impulse at the two anchors: B gains it, A loses it. Each body also
// picks up the torque of the impulse about its own lever arm, which is the term that lets a joint spin a
// body it is only pulling on.
//
// A static or fixed-rotation body's zero inverse mass and zero inverse inertia make this a no-op with no
// branch, which is the whole reason infinite mass is a zero inverse rather than a flag.
export function applyPhysics3DJointImpulse(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
): void {
  applyBodyJointImpulse(bodyA, rAX, rAY, rAZ, -impulseX, -impulseY, -impulseZ);
  applyBodyJointImpulse(bodyB, rBX, rBY, rBZ, impulseX, impulseY, impulseZ);
}

// Applies one scalar constraint row's impulse — the counterpart of `getPhysics3DJointRowMass`, acting
// through the same linear direction and the same two angular arms, so a row's mass and its impulse can
// never describe different constraints.
//
// The arms are given rather than derived because they are NOT always `r x direction`. A slider's
// perpendicular row acts through `(rA + separation) x direction` on A, since its axis is carried by A and
// rotates with it; using A's bare lever arm there leaks motion sideways whenever the rail body turns.
export function applyPhysics3DJointRowImpulse(
  bodyA: RigidBody3D,
  bodyB: RigidBody3D,
  directionX: number,
  directionY: number,
  directionZ: number,
  armAX: number,
  armAY: number,
  armAZ: number,
  armBX: number,
  armBY: number,
  armBZ: number,
  impulse: number,
): void {
  bodyA.velocityX -= impulse * directionX * bodyA.inverseMass;
  bodyA.velocityY -= impulse * directionY * bodyA.inverseMass;
  bodyA.velocityZ -= impulse * directionZ * bodyA.inverseMass;
  readWorldInverseInertia(bodyA, rowImpulseTensor);
  applySymmetricTensor(rowImpulseTensor, armAX * impulse, armAY * impulse, armAZ * impulse, rowImpulseVector);
  bodyA.angularVelocityX -= rowImpulseVector[0];
  bodyA.angularVelocityY -= rowImpulseVector[1];
  bodyA.angularVelocityZ -= rowImpulseVector[2];

  bodyB.velocityX += impulse * directionX * bodyB.inverseMass;
  bodyB.velocityY += impulse * directionY * bodyB.inverseMass;
  bodyB.velocityZ += impulse * directionZ * bodyB.inverseMass;
  readWorldInverseInertia(bodyB, rowImpulseTensor);
  applySymmetricTensor(rowImpulseTensor, armBX * impulse, armBY * impulse, armBZ * impulse, rowImpulseVector);
  bodyB.angularVelocityX += rowImpulseVector[0];
  bodyB.angularVelocityY += rowImpulseVector[1];
  bodyB.angularVelocityZ += rowImpulseVector[2];
}

// The scalar effective mass of one constraint row, given its linear direction and the two angular arms the
// row acts through. Returns 0 when the pair cannot move along the row at all, so the impulse computed from
// it is zero rather than infinite.
//
// The linear term is scaled by the direction's own squared length, so a PURELY ANGULAR row — a hinge's
// motor, a twist limit — passes a zero direction and the two bodies' translational masses drop out on their
// own. Without that scaling the caller would have to choose between two nearly identical functions, and the
// one place that picked wrong would report a hinge motor as heavier than it is by the pair's whole mass.
export function getPhysics3DJointRowMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  directionX: number,
  directionY: number,
  directionZ: number,
  armAX: number,
  armAY: number,
  armAZ: number,
  armBX: number,
  armBY: number,
  armBZ: number,
): number {
  const linear = directionX * directionX + directionY * directionY + directionZ * directionZ;
  let denominator = (bodyA.inverseMass + bodyB.inverseMass) * linear;

  readWorldInverseInertia(bodyA, rowMassTensor);
  applySymmetricTensor(rowMassTensor, armAX, armAY, armAZ, rowMassVector);
  denominator += armAX * rowMassVector[0] + armAY * rowMassVector[1] + armAZ * rowMassVector[2];

  readWorldInverseInertia(bodyB, rowMassTensor);
  applySymmetricTensor(rowMassTensor, armBX, armBY, armBZ, rowMassVector);
  denominator += armBX * rowMassVector[0] + armBY * rowMassVector[1] + armBZ * rowMassVector[2];

  return denominator > 0 ? 1 / denominator : 0;
}

// The rate at which one constraint row's coordinate is changing — B relative to A, so a positive value means
// the row's error is growing. The third member of the row triple, and the one every solve reads before
// deciding an impulse.
export function getPhysics3DJointRowVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  directionX: number,
  directionY: number,
  directionZ: number,
  armAX: number,
  armAY: number,
  armAZ: number,
  armBX: number,
  armBY: number,
  armBZ: number,
): number {
  return (
    (bodyB.velocityX - bodyA.velocityX) * directionX +
    (bodyB.velocityY - bodyA.velocityY) * directionY +
    (bodyB.velocityZ - bodyA.velocityZ) * directionZ +
    bodyB.angularVelocityX * armBX +
    bodyB.angularVelocityY * armBY +
    bodyB.angularVelocityZ * armBZ -
    bodyA.angularVelocityX * armAX -
    bodyA.angularVelocityY * armAY -
    bodyA.angularVelocityZ * armAZ
  );
}

// Exchanges a frame-bearing joint's two local rotations, so the generic end swap the registry performs
// stays consistent for every kind that carries a frame. Each rotation belongs to its body and travels with
// it; nothing about a frame reverses sign, unlike the direction-bearing scalars a kind may also hold.
export function swapPhysics3DJointFrames(frames: Physics3DJointFrames): void {
  const x = frames.localRotationAX;
  const y = frames.localRotationAY;
  const z = frames.localRotationAZ;
  const w = frames.localRotationAW;
  frames.localRotationAX = frames.localRotationBX;
  frames.localRotationAY = frames.localRotationBY;
  frames.localRotationAZ = frames.localRotationBZ;
  frames.localRotationAW = frames.localRotationBW;
  frames.localRotationBX = x;
  frames.localRotationBY = y;
  frames.localRotationBZ = z;
  frames.localRotationBW = w;
}

// Rotates each body's local anchor into world space, relative to that body's CENTRE OF MASS, and writes the
// two lever arms onto the joint.
//
// Measured from the centre of mass rather than from the body's origin, because that is the point a body
// rotates about: an impulse at an anchor produces the torque of its arm about the centre, and an arm taken
// from the origin gives an offset body the swing of a shape it does not have. The two coincide only when a
// body's centre of mass sits at its origin, which is why the error survives every test built from centred
// primitives.
export function writePhysics3DJointAnchors(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  joint: Physics3DJoint,
): void {
  rotateByQuaternion(
    joint.localAnchorAX - bodyA.centerX,
    joint.localAnchorAY - bodyA.centerY,
    joint.localAnchorAZ - bodyA.centerZ,
    bodyA.orientationX,
    bodyA.orientationY,
    bodyA.orientationZ,
    bodyA.orientationW,
    anchorVector,
  );
  joint.rAX = anchorVector[0];
  joint.rAY = anchorVector[1];
  joint.rAZ = anchorVector[2];

  rotateByQuaternion(
    joint.localAnchorBX - bodyB.centerX,
    joint.localAnchorBY - bodyB.centerY,
    joint.localAnchorBZ - bodyB.centerZ,
    bodyB.orientationX,
    bodyB.orientationY,
    bodyB.orientationZ,
    bodyB.orientationW,
    anchorVector,
  );
  joint.rBX = anchorVector[0];
  joint.rBY = anchorVector[1];
  joint.rBZ = anchorVector[2];
}

// The velocity of B's anchor relative to A's, written into `out` as three world-space components. Each
// anchor's velocity is its body's linear velocity plus the rotational contribution at its lever arm — the
// term that makes an anchor move even when the body's centre is still.
export function writePhysics3DJointAnchorVelocity(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  joint: Readonly<Physics3DJoint>,
  out: number[],
): void {
  const anchorAX = bodyA.velocityX + (bodyA.angularVelocityY * joint.rAZ - bodyA.angularVelocityZ * joint.rAY);
  const anchorAY = bodyA.velocityY + (bodyA.angularVelocityZ * joint.rAX - bodyA.angularVelocityX * joint.rAZ);
  const anchorAZ = bodyA.velocityZ + (bodyA.angularVelocityX * joint.rAY - bodyA.angularVelocityY * joint.rAX);

  out[0] = bodyB.velocityX + (bodyB.angularVelocityY * joint.rBZ - bodyB.angularVelocityZ * joint.rBY) - anchorAX;
  out[1] = bodyB.velocityY + (bodyB.angularVelocityZ * joint.rBX - bodyB.angularVelocityX * joint.rBZ) - anchorAY;
  out[2] = bodyB.velocityZ + (bodyB.angularVelocityX * joint.rBY - bodyB.angularVelocityY * joint.rBX) - anchorAZ;
}

// The pair's angular effective-mass block — the sum of the two world inverse inertia tensors — written into
// `out` in the six-component symmetric form. Invert it with `inverseSymmetricTensor` to solve a three-row
// angular constraint; project it onto an axis with `getPhysics3DJointRowMass` to solve a single row.
export function writePhysics3DJointAngularMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  out: number[],
): void {
  out[TENSOR_XX] = bodyA.inverseInertiaWorldXX + bodyB.inverseInertiaWorldXX;
  out[TENSOR_YY] = bodyA.inverseInertiaWorldYY + bodyB.inverseInertiaWorldYY;
  out[TENSOR_ZZ] = bodyA.inverseInertiaWorldZZ + bodyB.inverseInertiaWorldZZ;
  out[TENSOR_XY] = bodyA.inverseInertiaWorldXY + bodyB.inverseInertiaWorldXY;
  out[TENSOR_XZ] = bodyA.inverseInertiaWorldXZ + bodyB.inverseInertiaWorldXZ;
  out[TENSOR_YZ] = bodyA.inverseInertiaWorldYZ + bodyB.inverseInertiaWorldYZ;
}

// The world-space axes of one body's joint frame, written into `out` as nine numbers in COLUMN-MAJOR order:
// `out[0..2]` is the frame's X axis, `out[3..5]` its Y, `out[6..8]` its Z.
//
// X first is the convention every axis-bearing kind shares — a hinge spins about it, a slider translates
// along it, a cone-twist twists about it — so a caller that needs only the primary axis reads the first
// three numbers and stops.
export function writePhysics3DJointFrameBasis(
  body: Readonly<RigidBody3D>,
  localRotationX: number,
  localRotationY: number,
  localRotationZ: number,
  localRotationW: number,
  out: number[],
): void {
  multiplyQuaternions(
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    localRotationX,
    localRotationY,
    localRotationZ,
    localRotationW,
    basisRotation,
  );

  const x = basisRotation[0];
  const y = basisRotation[1];
  const z = basisRotation[2];
  const w = basisRotation[3];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx2 = x * x2;
  const yy2 = y * y2;
  const zz2 = z * z2;
  const xy2 = x * y2;
  const xz2 = x * z2;
  const yz2 = y * z2;
  const wx2 = w * x2;
  const wy2 = w * y2;
  const wz2 = w * z2;

  out[0] = 1 - yy2 - zz2;
  out[1] = xy2 + wz2;
  out[2] = xz2 - wy2;
  out[3] = xy2 - wz2;
  out[4] = 1 - xx2 - zz2;
  out[5] = yz2 + wx2;
  out[6] = xz2 + wy2;
  out[7] = yz2 - wx2;
  out[8] = 1 - xx2 - yy2;
}

// One body's joint frame as a world-space unit quaternion, written into `out` as `[x, y, z, w]`. The
// rotation half of the frame `writePhysics3DJointFrameBasis` expands into axes; kinds that measure an angle
// rather than project onto an axis want this form.
export function writePhysics3DJointFrameRotation(
  body: Readonly<RigidBody3D>,
  localRotationX: number,
  localRotationY: number,
  localRotationZ: number,
  localRotationW: number,
  out: number[],
): void {
  multiplyQuaternions(
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    localRotationX,
    localRotationY,
    localRotationZ,
    localRotationW,
    out,
  );
}

// The 3x3 effective-mass block of a point-to-point constraint, written into `out` in the six-component
// symmetric form.
//
// `K = (invMassA + invMassB) * identity + skew(rA) * invInertiaA * transpose(skew(rA)) + (same for B)`, and
// it is symmetric by construction because each term is. Invert it with `inverseSymmetricTensor` and the
// three rows are solved as one coupled block; solving x, then y, then z instead lets each axis undo part of
// the previous correction, which presents as a loaded joint that visibly creeps.
export function writePhysics3DJointPointMass(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  rAX: number,
  rAY: number,
  rAZ: number,
  rBX: number,
  rBY: number,
  rBZ: number,
  out: number[],
): void {
  const diagonal = bodyA.inverseMass + bodyB.inverseMass;
  out[TENSOR_XX] = diagonal;
  out[TENSOR_YY] = diagonal;
  out[TENSOR_ZZ] = diagonal;
  out[TENSOR_XY] = 0;
  out[TENSOR_XZ] = 0;
  out[TENSOR_YZ] = 0;

  readWorldInverseInertia(bodyA, pointMassTensor);
  addSkewSandwich(pointMassTensor, rAX, rAY, rAZ, out);
  readWorldInverseInertia(bodyB, pointMassTensor);
  addSkewSandwich(pointMassTensor, rBX, rBY, rBZ, out);
}

// The rotation taking frame A onto frame B, written into `out` as `[x, y, z, w]` and expressed IN A'S OWN
// FRAME rather than in world space. `conjugate(frameA) * frameB`.
//
// A's frame is the useful one for a kind that has to take the rotation apart — a cone-twist reads its twist
// straight off the X component here, because A's X is what twist is defined about. A kind that only needs
// the error as one vector wants `writePhysics3DJointRotationError` instead, which is this rotated out to
// world space where the inverse inertia tensors live.
//
// `w` is always non-negative on return. A unit quaternion and its negation name the same rotation, so
// without that fix half of all inputs would decompose as the long way round: a frame a degree from aligned
// would read as 359 degrees out, and every limit built on it would fire against the wrong bound.
export function writePhysics3DJointRelativeRotation(
  frameAX: number,
  frameAY: number,
  frameAZ: number,
  frameAW: number,
  frameBX: number,
  frameBY: number,
  frameBZ: number,
  frameBW: number,
  out: number[],
): void {
  multiplyQuaternions(-frameAX, -frameAY, -frameAZ, frameAW, frameBX, frameBY, frameBZ, frameBW, out);
  if (out[3] < 0) {
    out[0] = -out[0];
    out[1] = -out[1];
    out[2] = -out[2];
    out[3] = -out[3];
  }
}

// The rotation taking frame A onto frame B, written into `out` as a world-space vector whose direction is
// the axis and whose magnitude is the angle in radians. Zero exactly when the two frames coincide, which is
// what makes it usable directly as the positional error of an angular constraint.
//
// The angle comes from `2 * atan2(|v|, w)` rather than from the small-angle shortcut `2 * v`. The shortcut
// is `2 * sin(angle/2) * axis`, which agrees near zero and is 10% short by a quarter turn — invisible on a
// locked axis, and a limit that stops progressively early as it opens up.
//
// The shorter of the two arcs is always chosen. A unit quaternion and its negation name the same rotation,
// so without the sign fix half of all inputs would report the long way round: a frame a degree from aligned
// would read as 359 degrees out and the constraint would drive it the wrong way.
export function writePhysics3DJointRotationError(
  frameAX: number,
  frameAY: number,
  frameAZ: number,
  frameAW: number,
  frameBX: number,
  frameBY: number,
  frameBZ: number,
  frameBW: number,
  out: number[],
): void {
  writePhysics3DJointRelativeRotation(
    frameAX,
    frameAY,
    frameAZ,
    frameAW,
    frameBX,
    frameBY,
    frameBZ,
    frameBW,
    rotationErrorRelative,
  );

  const x = rotationErrorRelative[0];
  const y = rotationErrorRelative[1];
  const z = rotationErrorRelative[2];
  const sine = Math.sqrt(x * x + y * y + z * z);
  if (sine < QUATERNION_EPSILON) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }

  const scale = (2 * Math.atan2(sine, rotationErrorRelative[3])) / sine;
  rotateByQuaternion(x * scale, y * scale, z * scale, frameAX, frameAY, frameAZ, frameAW, out);
}

// The world-space offset from A's anchor to B's, written into `out` — the positional error of a
// point-to-point constraint, and the vector every axis-bearing kind projects onto its frame.
//
// Built as `worldCenter + leverArm` rather than `bodyOrigin + leverArm`. The lever arm is measured from the
// centre of mass, so adding it to the origin lands on the anchor only when the two coincide; for a body
// whose centre is offset, the two anchors are each wrong by their own rotated offset and the difference
// does not cancel.
export function writePhysics3DJointSeparation(
  bodyA: Readonly<RigidBody3D>,
  bodyB: Readonly<RigidBody3D>,
  joint: Readonly<Physics3DJoint>,
  out: number[],
): void {
  writeWorldCenter(bodyA, separationCenter);
  const anchorAX = separationCenter[0] + joint.rAX;
  const anchorAY = separationCenter[1] + joint.rAY;
  const anchorAZ = separationCenter[2] + joint.rAZ;

  writeWorldCenter(bodyB, separationCenter);
  out[0] = separationCenter[0] + joint.rBX - anchorAX;
  out[1] = separationCenter[1] + joint.rBY - anchorAY;
  out[2] = separationCenter[2] + joint.rBZ - anchorAZ;
}

// Adds `skew(r) * tensor * transpose(skew(r))` into an accumulating symmetric block. The rows of `skew(r)`
// are the three vectors below, and entry (i,j) of the product is `row_i . tensor . row_j` — six distinct
// entries for a symmetric result, which is why only six are computed.
function addSkewSandwich(tensor: Readonly<ArrayLike<number>>, rX: number, rY: number, rZ: number, out: number[]): void {
  applySymmetricTensor(tensor, 0, -rZ, rY, skewRow0);
  applySymmetricTensor(tensor, rZ, 0, -rX, skewRow1);
  applySymmetricTensor(tensor, -rY, rX, 0, skewRow2);

  out[TENSOR_XX] += -rZ * skewRow0[1] + rY * skewRow0[2];
  out[TENSOR_YY] += rZ * skewRow1[0] - rX * skewRow1[2];
  out[TENSOR_ZZ] += -rY * skewRow2[0] + rX * skewRow2[1];
  out[TENSOR_XY] += -rZ * skewRow1[1] + rY * skewRow1[2];
  out[TENSOR_XZ] += -rZ * skewRow2[1] + rY * skewRow2[2];
  out[TENSOR_YZ] += rZ * skewRow2[0] - rX * skewRow2[2];
}

function applyBodyJointImpulse(
  body: RigidBody3D,
  rX: number,
  rY: number,
  rZ: number,
  impulseX: number,
  impulseY: number,
  impulseZ: number,
): void {
  body.velocityX += impulseX * body.inverseMass;
  body.velocityY += impulseY * body.inverseMass;
  body.velocityZ += impulseZ * body.inverseMass;

  const torqueX = rY * impulseZ - rZ * impulseY;
  const torqueY = rZ * impulseX - rX * impulseZ;
  const torqueZ = rX * impulseY - rY * impulseX;

  readWorldInverseInertia(body, bodyImpulseTensor);
  applySymmetricTensor(bodyImpulseTensor, torqueX, torqueY, torqueZ, bodyImpulseVector);
  body.angularVelocityX += bodyImpulseVector[0];
  body.angularVelocityY += bodyImpulseVector[1];
  body.angularVelocityZ += bodyImpulseVector[2];
}

// `out = a * b`, the Hamilton product, in the order that composes b's rotation FIRST and then a's. Frames
// are built as `bodyOrientation * localRotation` for exactly that reason: the local rotation is expressed in
// body space and the body's orientation carries it out to the world.
function multiplyQuaternions(
  aX: number,
  aY: number,
  aZ: number,
  aW: number,
  bX: number,
  bY: number,
  bZ: number,
  bW: number,
  out: number[],
): void {
  out[0] = aW * bX + aX * bW + aY * bZ - aZ * bY;
  out[1] = aW * bY - aX * bZ + aY * bW + aZ * bX;
  out[2] = aW * bZ + aX * bY - aY * bX + aZ * bW;
  out[3] = aW * bW - aX * bX - aY * bY - aZ * bZ;
}

function readWorldInverseInertia(body: Readonly<RigidBody3D>, out: number[]): void {
  out[TENSOR_XX] = body.inverseInertiaWorldXX;
  out[TENSOR_YY] = body.inverseInertiaWorldYY;
  out[TENSOR_ZZ] = body.inverseInertiaWorldZZ;
  out[TENSOR_XY] = body.inverseInertiaWorldXY;
  out[TENSOR_XZ] = body.inverseInertiaWorldXZ;
  out[TENSOR_YZ] = body.inverseInertiaWorldYZ;
}

// `v + 2 * q.xyz x (q.xyz x v + q.w * v)`, the standard reduction of `q * v * conjugate(q)` for a unit
// quaternion. Safe when `out` is one of the inputs, since every component is read into a local first.
function rotateByQuaternion(
  vX: number,
  vY: number,
  vZ: number,
  qX: number,
  qY: number,
  qZ: number,
  qW: number,
  out: number[],
): void {
  const tX = qY * vZ - qZ * vY + qW * vX;
  const tY = qZ * vX - qX * vZ + qW * vY;
  const tZ = qX * vY - qY * vX + qW * vZ;

  out[0] = vX + 2 * (qY * tZ - qZ * tY);
  out[1] = vY + 2 * (qZ * tX - qX * tZ);
  out[2] = vZ + 2 * (qX * tY - qY * tX);
}

function writeWorldCenter(body: Readonly<RigidBody3D>, out: number[]): void {
  rotateByQuaternion(
    body.centerX,
    body.centerY,
    body.centerZ,
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    out,
  );
  out[0] += body.x;
  out[1] += body.y;
  out[2] += body.z;
}

// Below the tolerance the rotation error is genuinely zero and the axis is undefined; returning a zero
// vector is correct there, where dividing by the vanishing sine would seed NaN into both bodies.
const QUATERNION_EPSILON = 1e-12;
// Per-function scratch, never shared between two functions that can be live at once. One shared pool would
// be smaller and would corrupt the outer call the first time one of these grew a nested use.
const angularImpulseTensor = [0, 0, 0, 0, 0, 0];
const angularImpulseVector = [0, 0, 0];
const anchorVector = [0, 0, 0];
const basisRotation = [0, 0, 0, 0];
const bodyImpulseTensor = [0, 0, 0, 0, 0, 0];
const bodyImpulseVector = [0, 0, 0];
const pointMassTensor = [0, 0, 0, 0, 0, 0];
const rotationErrorRelative = [0, 0, 0, 0];
const rowImpulseTensor = [0, 0, 0, 0, 0, 0];
const rowImpulseVector = [0, 0, 0];
const rowMassTensor = [0, 0, 0, 0, 0, 0];
const rowMassVector = [0, 0, 0];
const separationCenter = [0, 0, 0];
const skewRow0 = [0, 0, 0];
const skewRow1 = [0, 0, 0];
const skewRow2 = [0, 0, 0];
