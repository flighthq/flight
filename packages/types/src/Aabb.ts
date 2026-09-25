import type { Entity } from './Entity.ts';
import type { Vector3, Vector3Like } from './Vector3.ts';

// Axis-aligned bounding box in a single coordinate space. `min`/`max` are the per-axis
// component-wise extremes; an empty/uninitialized box conventionally carries min > max
// (+Infinity / -Infinity) so the first point expanded into it sets both.
export interface Aabb extends Entity {
  max: Vector3;
  min: Vector3;
}

export type AabbLike = {
  max: Vector3Like;
  min: Vector3Like;
};
