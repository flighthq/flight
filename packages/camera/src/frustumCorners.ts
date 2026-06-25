import { createMatrix4, inverseMatrix4 } from '@flighthq/geometry';
import type { Camera, Vector3Like } from '@flighthq/types';

import { getCameraViewProjectionMatrix4 } from './camera';

// Writes the 8 world-space corners of the camera frustum into `out` (a length-8 array of
// Vector3Like) and returns true. Returns false (leaving `out` untouched) when the
// view-projection is non-invertible. `aspect` is viewport width / height.
//
// Corner ordering (NDC cube vertices, rows = near then far):
//   0: (-1, -1, -1) near bottom-left
//   1: ( 1, -1, -1) near bottom-right
//   2: (-1,  1, -1) near top-left
//   3: ( 1,  1, -1) near top-right
//   4: (-1, -1,  1) far bottom-left
//   5: ( 1, -1,  1) far bottom-right
//   6: (-1,  1,  1) far top-left
//   7: ( 1,  1,  1) far top-right
//
// Needed for cascaded shadow maps, debug draw, and tight bounds fitting.
// Reads all inputs before writing any `out` element, so it is alias-safe.
export function getCameraFrustumCorners(
  out: [Vector3Like, Vector3Like, Vector3Like, Vector3Like, Vector3Like, Vector3Like, Vector3Like, Vector3Like],
  camera: Readonly<Camera>,
  aspect: number,
): boolean {
  getCameraViewProjectionMatrix4(__scratchViewProjection, camera, aspect);
  if (!inverseMatrix4(__scratchInverseVP, __scratchViewProjection)) {
    return false;
  }
  const m = __scratchInverseVP.m;
  // Unproject each NDC corner through the inverse view-projection, applying
  // the perspective divide. All results are computed before writing to out.
  const ndcCorners: number[][] = [
    [-1, -1, -1],
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];
  // Compute all 8 corners into temporaries before writing.
  const results: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const [nx, ny, nz] = ndcCorners[i];
    let wx = m[0] * nx + m[4] * ny + m[8] * nz + m[12];
    let wy = m[1] * nx + m[5] * ny + m[9] * nz + m[13];
    let wz = m[2] * nx + m[6] * ny + m[10] * nz + m[14];
    const ww = m[3] * nx + m[7] * ny + m[11] * nz + m[15];
    if (ww !== 0) {
      const invW = 1 / ww;
      wx *= invW;
      wy *= invW;
      wz *= invW;
    }
    results.push([wx, wy, wz]);
  }
  // Write all results to output.
  for (let i = 0; i < 8; i++) {
    out[i].x = results[i][0];
    out[i].y = results[i][1];
    out[i].z = results[i][2];
  }
  return true;
}

// Scratch objects reused across calls. Single-threaded; not re-entrant.
const __scratchViewProjection = createMatrix4();
const __scratchInverseVP = createMatrix4();
