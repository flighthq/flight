import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Vector3 } from './Vector3';

// A 3D ray: an origin point and a direction (conventionally unit-length). Points along the ray
// are parameterized as origin + t * direction for t >= 0.
export interface Ray3D extends Entity {
  direction: Vector3;
  origin: Vector3;
}

export type Ray3DLike = EntityWithoutRuntime<Ray3D>;
