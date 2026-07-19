import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Quaternion } from './Quaternion';
import type { Vector3 } from './Vector3';

// Decomposed 3D transform carrier — the passable, one-operation-assignable form of a scene node's
// local transform. Same fields the `HasTransform3D` node trait exposes; a node is `Transform3DLike`.
// Composes to `Matrix4` canonically (`composeMatrix4`); the reverse (`decomposeMatrix4`) is lossy on
// shear, since quaternion-TRS (9 DOF) cannot represent a general affine's 12 DOF. `rotation` is a unit
// quaternion (radians-equivalent, no euler-order ambiguity).
export interface Transform3D extends Entity {
  rotation: Quaternion;
  scale: Vector3;
  translation: Vector3;
}

export type Transform3DLike = EntityWithoutRuntime<Transform3D>;
