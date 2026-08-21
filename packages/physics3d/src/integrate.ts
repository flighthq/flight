import type { RigidBody3D } from '@flighthq/types/contract';

import {
  applySymmetricTensor,
  rotateSymmetricTensor,
  TENSOR_XX,
  TENSOR_XY,
  TENSOR_XZ,
  TENSOR_YY,
  TENSOR_YZ,
  TENSOR_ZZ,
} from './symmetricTensor';

// Integration: turning forces into velocities and velocities into poses.
//
// The scheme is semi-implicit (symplectic) Euler — velocity is advanced first and the NEW velocity
// moves the pose. The ordering is the whole reason it is stable enough for games: explicit Euler, which
// moves the pose by the old velocity, injects energy on every step and makes an orbit spiral outward.
//
// These are exported separately rather than folded into the step because a caller assembling its own
// step wants exactly these pieces, and because each is independently testable — which matters most for
// the angular half, whose failure mode is a slow drift no single-step assertion would catch.

// Clears the force and torque accumulators. Called by the step once the forces have been integrated, so
// a caller applying a force each frame does not have it applied twice.
export function clearRigidBody3DForces(body: RigidBody3D): void {
  body.forceX = 0;
  body.forceY = 0;
  body.forceZ = 0;
  body.torqueX = 0;
  body.torqueY = 0;
  body.torqueZ = 0;
}

// Advances a body's pose by its current velocity over `dt`.
//
// The CENTRE OF MASS takes the straight Euler step because that is where `velocity` is measured. The
// stored position is the body's authored origin, which may be offset from that centre: after rotation it
// is shifted by oldRotatedCentre - newRotatedCentre so pure angular motion cannot make the centre orbit.
//
// Orientation is advanced by the quaternion derivative `0.5 * omega * q`, where omega is the angular
// velocity as a pure quaternion. That step leaves the unit sphere — it is a tangent move on a curved
// manifold — so the result is renormalized. Skipping the renormalization does not look wrong for a step
// or a hundred; it accumulates into a quaternion whose rotation matrix is no longer orthonormal, which
// reads downstream as a body that is subtly sheared and getting worse.
export function integrateRigidBody3DPose(body: RigidBody3D, dt: number): void {
  if (body.type === 'static' || body.sleeping) return;

  body.x += body.velocityX * dt;
  body.y += body.velocityY * dt;
  body.z += body.velocityZ * dt;

  const wX = body.angularVelocityX;
  const wY = body.angularVelocityY;
  const wZ = body.angularVelocityZ;
  if (wX === 0 && wY === 0 && wZ === 0) return;

  const qX = body.orientationX;
  const qY = body.orientationY;
  const qZ = body.orientationZ;
  const qW = body.orientationW;

  const centerX = body.centerX;
  const centerY = body.centerY;
  const centerZ = body.centerZ;
  const offset = centerX !== 0 || centerY !== 0 || centerZ !== 0;
  let oldCenterX = 0;
  let oldCenterY = 0;
  let oldCenterZ = 0;
  if (offset) {
    const tX = 2 * (qY * centerZ - qZ * centerY);
    const tY = 2 * (qZ * centerX - qX * centerZ);
    const tZ = 2 * (qX * centerY - qY * centerX);
    oldCenterX = centerX + qW * tX + qY * tZ - qZ * tY;
    oldCenterY = centerY + qW * tY + qZ * tX - qX * tZ;
    oldCenterZ = centerZ + qW * tZ + qX * tY - qY * tX;
  }

  const half = dt * 0.5;
  const nX = qX + half * (wX * qW + wY * qZ - wZ * qY);
  const nY = qY + half * (wY * qW + wZ * qX - wX * qZ);
  const nZ = qZ + half * (wZ * qW + wX * qY - wY * qX);
  const nW = qW + half * (-wX * qX - wY * qY - wZ * qZ);

  const lengthSquared = nX * nX + nY * nY + nZ * nZ + nW * nW;
  if (lengthSquared <= 0 || !Number.isFinite(lengthSquared)) {
    // The only way here is a non-finite angular velocity, which a diverging simulation produces. Hold
    // the previous orientation rather than writing NaN into it: a NaN pose spreads to every constraint
    // the body touches within one step, and a held orientation is at least a state a caller can see.
    return;
  }
  const scale = 1 / Math.sqrt(lengthSquared);
  const nextX = nX * scale;
  const nextY = nY * scale;
  const nextZ = nZ * scale;
  const nextW = nW * scale;
  if (offset) {
    const tX = 2 * (nextY * centerZ - nextZ * centerY);
    const tY = 2 * (nextZ * centerX - nextX * centerZ);
    const tZ = 2 * (nextX * centerY - nextY * centerX);
    body.x += oldCenterX - (centerX + nextW * tX + nextY * tZ - nextZ * tY);
    body.y += oldCenterY - (centerY + nextW * tY + nextZ * tX - nextX * tZ);
    body.z += oldCenterZ - (centerZ + nextW * tZ + nextX * tY - nextY * tX);
  }
  body.orientationX = nextX;
  body.orientationY = nextY;
  body.orientationZ = nextZ;
  body.orientationW = nextW;
}

// Advances a body's velocities by the accumulated forces, gravity, and damping over `dt`.
//
// The angular half carries the term that does not exist in 2D: Euler's equation for a rotating rigid
// body is `torque = I * alpha + omega x (I * omega)`, and that second term — the gyroscopic torque — is
// what makes a thrown object tumble rather than spin about a fixed axis. In 2D it vanishes identically,
// because omega and `I * omega` are parallel when I is a scalar. Dropping it in 3D costs nothing on a
// sphere and is visibly wrong on anything long.
//
// Damping is applied as an exponential decay rather than a subtraction, so the result does not depend
// on the step size and a large `dt` can never drive a velocity through zero into reverse.
export function integrateRigidBody3DVelocity(
  body: RigidBody3D,
  gravityX: number,
  gravityY: number,
  gravityZ: number,
  dt: number,
): void {
  if (body.type !== 'dynamic' || body.sleeping) return;

  body.velocityX += (body.forceX * body.inverseMass + gravityX * body.gravityScale) * dt;
  body.velocityY += (body.forceY * body.inverseMass + gravityY * body.gravityScale) * dt;
  body.velocityZ += (body.forceZ * body.inverseMass + gravityZ * body.gravityScale) * dt;

  const wX = body.angularVelocityX;
  const wY = body.angularVelocityY;
  const wZ = body.angularVelocityZ;

  // The gyroscopic torque, `-omega x (I * omega)`. It needs the FORWARD world inertia, which is why the
  // body stores its forward local tensor: rotating that into world space is one similarity transform,
  // where recovering it from the inverse would be a 3x3 inversion per body per substep.
  //
  // Explicit here, which is the standard game-engine treatment and is stable at ordinary timesteps. A
  // body spinning fast enough that its momentum turns appreciably within one step needs an implicit
  // form; the substep count is the lever for that, and is why it exists.
  let torqueX = body.torqueX;
  let torqueY = body.torqueY;
  let torqueZ = body.torqueZ;
  if (wX !== 0 || wY !== 0 || wZ !== 0) {
    scratchTensor[TENSOR_XX] = body.inertiaXX;
    scratchTensor[TENSOR_YY] = body.inertiaYY;
    scratchTensor[TENSOR_ZZ] = body.inertiaZZ;
    scratchTensor[TENSOR_XY] = body.inertiaXY;
    scratchTensor[TENSOR_XZ] = body.inertiaXZ;
    scratchTensor[TENSOR_YZ] = body.inertiaYZ;
    rotateSymmetricTensor(
      scratchTensor,
      body.orientationX,
      body.orientationY,
      body.orientationZ,
      body.orientationW,
      scratchTensor,
    );

    // scratchVector becomes the angular momentum `L = I * omega`.
    applySymmetricTensor(scratchTensor, wX, wY, wZ, scratchVector);
    torqueX -= wY * scratchVector[2] - wZ * scratchVector[1];
    torqueY -= wZ * scratchVector[0] - wX * scratchVector[2];
    torqueZ -= wX * scratchVector[1] - wY * scratchVector[0];
  }

  readWorldInertia(body, scratchTensor);
  applySymmetricTensor(scratchTensor, torqueX, torqueY, torqueZ, scratchVector);

  body.angularVelocityX = wX + scratchVector[0] * dt;
  body.angularVelocityY = wY + scratchVector[1] * dt;
  body.angularVelocityZ = wZ + scratchVector[2] * dt;

  if (body.linearDamping > 0) {
    const damping = 1 / (1 + dt * body.linearDamping);
    body.velocityX *= damping;
    body.velocityY *= damping;
    body.velocityZ *= damping;
  }
  if (body.angularDamping > 0) {
    const damping = 1 / (1 + dt * body.angularDamping);
    body.angularVelocityX *= damping;
    body.angularVelocityY *= damping;
    body.angularVelocityZ *= damping;
  }
}

// Refreshes the world-space inverse inertia tensor from the body's orientation and its local tensor.
//
// Must run whenever the orientation changes — which is every substep for anything rotating, and at
// insertion and teleport for everything else. It is a pull rather than an invalidation flag because
// every rotating body needs it every substep anyway, so a flag would be checked far more often than it
// would ever be false.
export function refreshRigidBody3DWorldInertia(body: RigidBody3D): void {
  scratchTensor[TENSOR_XX] = body.inverseInertiaXX;
  scratchTensor[TENSOR_YY] = body.inverseInertiaYY;
  scratchTensor[TENSOR_ZZ] = body.inverseInertiaZZ;
  scratchTensor[TENSOR_XY] = body.inverseInertiaXY;
  scratchTensor[TENSOR_XZ] = body.inverseInertiaXZ;
  scratchTensor[TENSOR_YZ] = body.inverseInertiaYZ;

  rotateSymmetricTensor(
    scratchTensor,
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    scratchTensor,
  );

  body.inverseInertiaWorldXX = scratchTensor[TENSOR_XX];
  body.inverseInertiaWorldYY = scratchTensor[TENSOR_YY];
  body.inverseInertiaWorldZZ = scratchTensor[TENSOR_ZZ];
  body.inverseInertiaWorldXY = scratchTensor[TENSOR_XY];
  body.inverseInertiaWorldXZ = scratchTensor[TENSOR_XZ];
  body.inverseInertiaWorldYZ = scratchTensor[TENSOR_YZ];
}

function readWorldInertia(body: Readonly<RigidBody3D>, out: number[]): void {
  out[TENSOR_XX] = body.inverseInertiaWorldXX;
  out[TENSOR_YY] = body.inverseInertiaWorldYY;
  out[TENSOR_ZZ] = body.inverseInertiaWorldZZ;
  out[TENSOR_XY] = body.inverseInertiaWorldXY;
  out[TENSOR_XZ] = body.inverseInertiaWorldXZ;
  out[TENSOR_YZ] = body.inverseInertiaWorldYZ;
}

const scratchTensor = [0, 0, 0, 0, 0, 0];
const scratchVector = [0, 0, 0];
