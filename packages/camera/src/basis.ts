import type { Camera, Vector3Like } from '@flighthq/types';

// Extracts the camera's world-space forward direction (-Z of the camera frame) from the view
// matrix and writes it into `out`. In a right-handed camera frame the forward vector points
// from the eye toward the target; it is the negated third row of the view matrix.
//
// Safe when `out` aliases any field of the camera.
export function getCameraForward(out: Vector3Like, camera: Readonly<Camera>): void {
  const m = camera.view.m;
  // Row 2 of the view matrix is the negated forward direction in world space.
  // Negate to get the true forward (eye→target).
  out.x = -m[2];
  out.y = -m[6];
  out.z = -m[10];
}

// Extracts the camera's world-space eye position from the view matrix and writes it into
// `out`. For an orthonormal view matrix (rotation + translation), the eye position is
// computed as the inverse translation without a full matrix inversion:
//   eye = -(R^T · t)  where R is the upper-3x3 and t is m[12..14] of the view.
//
// This is the canonical source for the camera eye position; the scene-gl mesh renderer
// (setGlMeshCameraPosition) should delegate here rather than recomputing it inline.
//
// Safe when `out` aliases any field of the camera.
export function getCameraPosition(out: Vector3Like, camera: Readonly<Camera>): void {
  const m = camera.view.m;
  // Column-major storage: element(row, col) = m[row + 4*col].
  // The 3×3 rotation block R^T (transposed) has rows:
  //   row 0: m[0], m[1], m[2]   (column 0 of R = right x-components)
  //   row 1: m[4], m[5], m[6]   (column 1 of R = up y-components ... wait, this is col 1 of R)
  // Actually R^T column 0 = R row 0 = [m[0], m[4], m[8]], but the inverse translation is:
  //   eye = -(R^T · t)
  //   (R^T · t).x = m[0]*m[12] + m[1]*m[13] + m[2]*m[14]
  //   (R^T · t).y = m[4]*m[12] + m[5]*m[13] + m[6]*m[14]
  //   (R^T · t).z = m[8]*m[12] + m[9]*m[13] + m[10]*m[14]
  const m00 = m[0],
    m01 = m[1],
    m02 = m[2];
  const m10 = m[4],
    m11 = m[5],
    m12 = m[6];
  const m20 = m[8],
    m21 = m[9],
    m22 = m[10];
  const tx = m[12],
    ty = m[13],
    tz = m[14];
  // Read all inputs before writing (alias-safe).
  out.x = -(m00 * tx + m01 * ty + m02 * tz);
  out.y = -(m10 * tx + m11 * ty + m12 * tz);
  out.z = -(m20 * tx + m21 * ty + m22 * tz);
}

// Extracts the camera's world-space right direction (+X of the camera frame) from the view
// matrix and writes it into `out`. It is the first row of the view matrix.
//
// Safe when `out` aliases any field of the camera.
export function getCameraRight(out: Vector3Like, camera: Readonly<Camera>): void {
  const m = camera.view.m;
  out.x = m[0];
  out.y = m[4];
  out.z = m[8];
}

// Extracts the camera's world-space up direction (+Y of the camera frame) from the view
// matrix and writes it into `out`. It is the second row of the view matrix.
//
// Safe when `out` aliases any field of the camera.
export function getCameraUp(out: Vector3Like, camera: Readonly<Camera>): void {
  const m = camera.view.m;
  out.x = m[1];
  out.y = m[5];
  out.z = m[9];
}
