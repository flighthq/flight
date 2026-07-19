import { createMatrix4 } from '@flighthq/geometry';
import { invalidateNodeLocalTransform, setNodeLocalMatrix4 } from '@flighthq/node';
import type { Quaternion, QuaternionLike, SceneNode, Vector3, Vector3Like } from '@flighthq/types';

// Reads the node's translation into `out`. Alias-safe.
export function getSceneNodePosition(out: Vector3, node: Readonly<SceneNode>): void {
  out.x = node.translation.x;
  out.y = node.translation.y;
  out.z = node.translation.z;
}

// Reads the node's rotation quaternion into `out`. Dormant if the local matrix is detached — call
// syncNodeTransform3DFromMatrix4 first to reflect a directly-set matrix. Alias-safe.
export function getSceneNodeRotationQuaternion(out: Quaternion, node: Readonly<SceneNode>): void {
  out.x = node.rotation.x;
  out.y = node.rotation.y;
  out.z = node.rotation.z;
  out.w = node.rotation.w;
}

// Reads the node's scale into `out`. Dormant if the local matrix is detached. Alias-safe.
export function getSceneNodeScale(out: Vector3, node: Readonly<SceneNode>): void {
  out.x = node.scale.x;
  out.y = node.scale.y;
  out.z = node.scale.z;
}

// Sets the node's local matrix directly to a model-space look-at transform that places the node at
// `eye`, oriented so its local -Z axis points toward `target`, with the given `up` hint vector. The
// resulting matrix has unit scale and no shear. This is a **model** matrix (position = eye,
// rotation = orientation toward target); it is NOT a view matrix — use getCameraViewMatrix4 for
// camera view transforms. Because it authors the matrix directly, the node's TRS fields go dormant
// (detached) until reattached.
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
  const m = _scratchMatrix.m;
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
  setNodeLocalMatrix4(node, _scratchMatrix);
}

// Sets the node's translation and marks the local transform dirty. Reattaches TRS authoring.
export function setSceneNodePosition(node: SceneNode, x: number, y: number, z: number): void {
  node.translation.x = x;
  node.translation.y = y;
  node.translation.z = z;
  invalidateNodeLocalTransform(node);
}

// Sets the node's rotation quaternion and marks the local transform dirty. Reattaches TRS authoring.
export function setSceneNodeRotationQuaternion(node: SceneNode, q: Readonly<QuaternionLike>): void {
  const qx = q.x,
    qy = q.y,
    qz = q.z,
    qw = q.w;
  node.rotation.x = qx;
  node.rotation.y = qy;
  node.rotation.z = qz;
  node.rotation.w = qw;
  invalidateNodeLocalTransform(node);
}

// Sets the node's scale and marks the local transform dirty. Reattaches TRS authoring.
export function setSceneNodeScale(node: SceneNode, x: number, y: number, z: number): void {
  node.scale.x = x;
  node.scale.y = y;
  node.scale.z = z;
  invalidateNodeLocalTransform(node);
}

// Sets the node's translation, rotation, and scale together and marks the local transform dirty.
// Alias-safe: each argument is read before any node field is written.
export function setSceneNodeTransform(
  node: SceneNode,
  position: Readonly<Vector3Like>,
  rotation: Readonly<QuaternionLike>,
  scale: Readonly<Vector3Like>,
): void {
  const px = position.x,
    py = position.y,
    pz = position.z;
  const rx = rotation.x,
    ry = rotation.y,
    rz = rotation.z,
    rw = rotation.w;
  const sx = scale.x,
    sy = scale.y,
    sz = scale.z;
  node.translation.x = px;
  node.translation.y = py;
  node.translation.z = pz;
  node.rotation.x = rx;
  node.rotation.y = ry;
  node.rotation.z = rz;
  node.rotation.w = rw;
  node.scale.x = sx;
  node.scale.y = sy;
  node.scale.z = sz;
  invalidateNodeLocalTransform(node);
}

const _scratchMatrix = createMatrix4();
