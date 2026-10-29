import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';

// A capsule: the set of all points within `radius` of the line segment from (startX, startY,
// startZ) to (endX, endY, endZ). A negative radius conventionally marks an empty capsule.
export interface Capsule extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  endX: number;
  endY: number;
  endZ: number;
  radius: number;
  startX: number;
  startY: number;
  startZ: number;
}

export type CapsuleLike = EntityWithoutRuntime<Capsule>;

// The order in which per-axis rotations are composed when converting between Euler angles and a
// quaternion or matrix. Each value lists the axes in application order; 'XYZ' applies the X
// rotation first, then Y, then Z. Matches the glTF / three.js intrinsic-rotation convention used
// across the 3D suite.
export type EulerOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';

export interface Matrix extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export type MatrixLike = EntityWithoutRuntime<Matrix>;

export interface Matrix3 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly m: Float32Array;
}

export type Matrix3Like = EntityWithoutRuntime<Matrix3>;

export interface Matrix4 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly m: Float32Array;
}

export type Matrix4Like = EntityWithoutRuntime<Matrix4>;

// Unit quaternion (x, y, z, w) for 3D rotation. Handedness is pinned across the 3D suite:
// right-handed coordinates, CCW front-face. setMatrix4FromQuaternion and the mesh tangent
// w-sign convention follow glTF.
export interface Quaternion extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
  z: number;
  w: number;
}

export type QuaternionLike = EntityWithoutRuntime<Quaternion>;

export interface Rectangle extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type RectangleLike = EntityWithoutRuntime<Rectangle>;

export interface Vector2 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
}

export type Vector2Like = EntityWithoutRuntime<Vector2>;
