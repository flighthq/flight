import { createMatrix4 } from '@flighthq/geometry';
import { setNodeLocalMatrix4 } from '@flighthq/node';
import type { SceneNode, Vector3Like } from '@flighthq/types';

// Sets the node's local matrix directly to a model-space look-at transform that places the node at
// `eye`, oriented so its local -Z axis points toward `target`, with the given `up` hint vector. The
// resulting matrix has unit scale and no shear. This is a **model** matrix (position = eye,
// rotation = orientation toward target); it is NOT a view matrix — use getCameraViewMatrix4 for
// camera view transforms. Because it authors the matrix directly, the node's position/rotation/scale
// fields go dormant (detached) until reattached.
//
// Read/write the node's `position`/`rotation`/`scale` fields directly for component authoring (call
// `invalidateNodeLocalTransform` after), or `setNodeTransform3D`/`setNodeLocalMatrix4` for a whole
// transform. This exists because building a look-at orientation matrix is non-trivial.
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

const _scratchMatrix = createMatrix4();
