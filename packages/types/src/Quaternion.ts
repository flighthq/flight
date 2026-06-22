import type { Entity, EntityWithoutRuntime } from './Entity';

// Unit quaternion (x, y, z, w) for 3D rotation. Handedness is pinned across the 3D suite:
// right-handed coordinates, CCW front-face. setMatrix4FromQuaternion and the mesh tangent
// w-sign convention follow glTF.
export interface Quaternion extends Entity {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type QuaternionLike = EntityWithoutRuntime<Quaternion>;
