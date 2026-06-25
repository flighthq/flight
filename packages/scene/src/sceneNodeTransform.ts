import { composeMatrix4, createQuaternion, createVector3, decomposeMatrix4 } from '@flighthq/geometry';
import { invalidateNodeLocalTransform } from '@flighthq/node';
import type { Quaternion, QuaternionLike, SceneNode, Vector3, Vector3Like } from '@flighthq/types';

// Decomposes the node's `localMatrix` and writes the translation component into `out`.
// Alias-safe: reads the matrix before writing to `out`.
export function getSceneNodePosition(out: Vector3, node: Readonly<SceneNode>): void {
  const m = node.localMatrix.m;
  // Read all three translation components before any write so alias-safe.
  const tx = m[12];
  const ty = m[13];
  const tz = m[14];
  out.x = tx;
  out.y = ty;
  out.z = tz;
}

// Decomposes the node's `localMatrix` and writes the rotation quaternion into `out`.
// Alias-safe: internally reads the full matrix before writing to `out`.
export function getSceneNodeRotationQuaternion(out: Quaternion, node: Readonly<SceneNode>): void {
  const _scratch = _scratchVec3a;
  const _scratchQ = _scratchQuat;
  const _scratchS = _scratchVec3b;
  decomposeMatrix4(_scratch, _scratchQ, _scratchS, node.localMatrix);
  out.x = _scratchQ.x;
  out.y = _scratchQ.y;
  out.z = _scratchQ.z;
  out.w = _scratchQ.w;
}

// Decomposes the node's `localMatrix` and writes the scale component into `out`.
// Alias-safe: internally reads the full matrix before writing to `out`.
export function getSceneNodeScale(out: Vector3, node: Readonly<SceneNode>): void {
  const _scratch = _scratchVec3a;
  const _scratchQ = _scratchQuat;
  const _scratchS = _scratchVec3b;
  decomposeMatrix4(_scratch, _scratchQ, _scratchS, node.localMatrix);
  out.x = _scratchS.x;
  out.y = _scratchS.y;
  out.z = _scratchS.z;
}

// Sets the node's `localMatrix` to a model-space look-at transform that places the node at `eye`,
// oriented so its local -Z axis points toward `target`, with the given `up` hint vector. The
// resulting matrix has unit scale and no shear. This is a **model** matrix (position = eye,
// rotation = orientation toward target); it is NOT a view matrix — use getCameraViewMatrix4 for
// camera view transforms. Marks the local transform dirty.
//
// Note: geometry's setMatrix4LookAt is a view matrix (inverted). This function builds the model
// matrix directly: basis vectors are the same but the translation is eye, not -dot(axis, eye).
export function setSceneNodeLookAt(
  node: SceneNode,
  eye: Readonly<Vector3Like>,
  target: Readonly<Vector3Like>,
  up: Readonly<Vector3Like>,
): void {
  const eyeX = eye.x,
    eyeY = eye.y,
    eyeZ = eye.z;
  // Z axis = normalize(eye - target) — points backward in RH; -Z is the forward direction.
  let zx = eyeX - target.x;
  let zy = eyeY - target.y;
  let zz = eyeZ - target.z;
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (zl === 0) {
    zz = 1;
    zl = 1;
  }
  zx /= zl;
  zy /= zl;
  zz /= zl;
  // X axis = normalize(cross(up, z)).
  let xx = up.y * zz - up.z * zy;
  let xy = up.z * zx - up.x * zz;
  let xz = up.x * zy - up.y * zx;
  const xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (xl !== 0) {
    xx /= xl;
    xy /= xl;
    xz /= xl;
  }
  // Y axis = cross(z, x).
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  // Column-major model matrix: [X|Y|Z|translation].
  const m = node.localMatrix.m;
  m[0] = xx;
  m[1] = xy;
  m[2] = xz;
  m[3] = 0;
  m[4] = yx;
  m[5] = yy;
  m[6] = yz;
  m[7] = 0;
  m[8] = zx;
  m[9] = zy;
  m[10] = zz;
  m[11] = 0;
  m[12] = eyeX;
  m[13] = eyeY;
  m[14] = eyeZ;
  m[15] = 1;
  invalidateNodeLocalTransform(node);
}

// Sets the translation component of the node's `localMatrix` (position only; rotation and scale
// are preserved by decompose–recompose) and marks the local transform dirty. For a plain
// translation-only edit when the matrix is known to be identity-rotation and uniform-scale, use
// `setSceneNodePosition` which is faster.
export function setSceneNodePosition(node: SceneNode, x: number, y: number, z: number): void {
  // Fast path: just stomp the translation column; rotation and scale columns are unchanged.
  const m = node.localMatrix.m;
  m[12] = x;
  m[13] = y;
  m[14] = z;
  invalidateNodeLocalTransform(node);
}

// Sets the rotation component of the node's `localMatrix` via decompose–recompose with the
// existing position and scale, then marks the local transform dirty.
export function setSceneNodeRotationQuaternion(node: SceneNode, q: Readonly<QuaternionLike>): void {
  // Read position and scale before recompose (alias-safe even if q is somehow derived from node).
  decomposeMatrix4(_scratchVec3a, _scratchQuat, _scratchVec3b, node.localMatrix);
  composeMatrix4(node.localMatrix, _scratchVec3a, q, _scratchVec3b);
  invalidateNodeLocalTransform(node);
}

// Sets the scale component of the node's `localMatrix` via decompose–recompose with the existing
// position and rotation, then marks the local transform dirty.
export function setSceneNodeScale(node: SceneNode, x: number, y: number, z: number): void {
  _scratchVec3b.x = x;
  _scratchVec3b.y = y;
  _scratchVec3b.z = z;
  decomposeMatrix4(_scratchVec3a, _scratchQuat, _scratchVec3b2, node.localMatrix);
  composeMatrix4(node.localMatrix, _scratchVec3a, _scratchQuat, _scratchVec3b);
  invalidateNodeLocalTransform(node);
}

// Recomposes the node's `localMatrix` from separate position, rotation (quaternion), and scale
// vectors, then marks the local transform dirty. Alias-safe: each argument is read before any
// matrix element is written.
export function setSceneNodeTransform(
  node: SceneNode,
  position: Readonly<Vector3Like>,
  rotation: Readonly<QuaternionLike>,
  scale: Readonly<Vector3Like>,
): void {
  composeMatrix4(node.localMatrix, position, rotation, scale);
  invalidateNodeLocalTransform(node);
}

const _scratchVec3a = createVector3();
const _scratchVec3b = createVector3();
const _scratchVec3b2 = createVector3();
const _scratchQuat = createQuaternion(0, 0, 0, 1);
