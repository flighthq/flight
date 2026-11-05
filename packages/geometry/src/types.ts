import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';

// Axis-aligned bounding box in a single coordinate space. Empty boxes conventionally carry
// min > max so the first point expanded into them sets both corners.
export interface Aabb extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  max: Vector3;
  min: Vector3;
}

export type AabbLike = {
  max: Vector3Like;
  min: Vector3Like;
};

// Bounding sphere in a single coordinate space. A negative radius conventionally marks an empty sphere.
export interface BoundingSphere extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  center: Vector3;
  radius: number;
}

export type BoundingSphereLike = EntityWithoutRuntime<BoundingSphere>;

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

// A view frustum represented by six inward-facing bounding planes.
export interface Frustum extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  bottom: Plane;
  far: Plane;
  left: Plane;
  near: Plane;
  right: Plane;
  top: Plane;
}

export type FrustumLike = EntityWithoutRuntime<Frustum>;

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

// Oriented bounding box with a center, half-extents, and quaternion orientation stored as scalars.
export interface Obb extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  centerX: number;
  centerY: number;
  centerZ: number;
  halfExtentX: number;
  halfExtentY: number;
  halfExtentZ: number;
  orientationW: number;
  orientationX: number;
  orientationY: number;
  orientationZ: number;
}

export type ObbLike = EntityWithoutRuntime<Obb>;

// Plane in the form a*x + b*y + c*z + d = 0.
export interface Plane extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  a: number;
  b: number;
  c: number;
  d: number;
}

export type PlaneLike = EntityWithoutRuntime<Plane>;

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

// A 3D ray with an origin and a conventionally unit-length direction.
export interface Ray3D extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  direction: Vector3;
  origin: Vector3;
}

export type Ray3DLike = EntityWithoutRuntime<Ray3D>;

export interface Rectangle extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type RectangleLike = EntityWithoutRuntime<Rectangle>;

export interface Transform2D extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  pivotX: number;
  pivotY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  x: number;
  y: number;
}

export type Transform2DLike = EntityWithoutRuntime<Transform2D>;

export interface Transform3D extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export type Transform3DLike = EntityWithoutRuntime<Transform3D>;

export interface Vector2 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
}

export type Vector2Like = EntityWithoutRuntime<Vector2>;

export interface Vector3 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
  z: number;
}

export type Vector3Like = EntityWithoutRuntime<Vector3>;

export interface Vector4 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  w: number;
  x: number;
  y: number;
  z: number;
}

export type Vector4Like = EntityWithoutRuntime<Vector4>;
