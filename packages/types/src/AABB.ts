import type { Entity, EntityWithoutRuntime } from './Entity';
import type { Vector3 } from './Vector3';

// Axis-aligned bounding box in a single coordinate space. `min`/`max` are the per-axis
// component-wise extremes; an empty/uninitialized box conventionally carries min > max
// (+Infinity / -Infinity) so the first point expanded into it sets both.
export interface Aabb extends Entity {
  max: Vector3;
  min: Vector3;
}

export type AabbLike = EntityWithoutRuntime<Aabb>;
