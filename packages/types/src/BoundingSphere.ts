import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Vector3 } from './Vector3';

// Bounding sphere in a single coordinate space: a center point and a radius. A negative
// radius conventionally marks an empty sphere.
export interface BoundingSphere extends Entity {
  center: Vector3;
  radius: number;
}

export type BoundingSphereLike = EntityWithoutRuntime<BoundingSphere>;
