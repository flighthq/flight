import { setMatrix4LookAt } from '@flighthq/geometry/contract';
import type { Camera3D, Vector3Like } from '@flighthq/types/contract';

import { createPerspectiveProjection } from './projection';

// Sets `out` to the view and projection for one face of a cube-map capture from `position`.
// `face` is 0–5 corresponding to +X, −X, +Y, −Y, +Z, −Z (matching CubeFacePositiveX through
// CubeFaceNegativeZ in @flighthq/types). The projection is a 90° FOV square perspective
// (fovY = π/2, aspect = 1). near/far are left as-is on `out`.
//
// Alias-safe: `position` is read before any write.
export function getCubeCaptureFaceCamera3D(out: Camera3D, position: Readonly<Vector3Like>, face: number): void {
  const px = position.x;
  const py = position.y;
  const pz = position.z;

  const dir = _CUBE_FACE_DIRECTIONS[face];
  _target.x = px + dir[0];
  _target.y = py + dir[1];
  _target.z = pz + dir[2];
  _eye.x = px;
  _eye.y = py;
  _eye.z = pz;
  _up.x = dir[3];
  _up.y = dir[4];
  _up.z = dir[5];

  setMatrix4LookAt(out.view, _eye, _target, _up);
  out.projection = createPerspectiveProjection({ aspect: 1, fovY: Math.PI * 0.5 });
}

// [dirX, dirY, dirZ, upX, upY, upZ] per face index — GL cube-map convention.
const _CUBE_FACE_DIRECTIONS: readonly (readonly number[])[] = [
  [1, 0, 0, 0, -1, 0],
  [-1, 0, 0, 0, -1, 0],
  [0, 1, 0, 0, 0, 1],
  [0, -1, 0, 0, 0, -1],
  [0, 0, 1, 0, -1, 0],
  [0, 0, -1, 0, -1, 0],
];

const _eye: Vector3Like = { x: 0, y: 0, z: 0 };
const _target: Vector3Like = { x: 0, y: 0, z: 0 };
const _up: Vector3Like = { x: 0, y: 0, z: 0 };
