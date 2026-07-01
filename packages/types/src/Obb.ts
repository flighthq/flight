import type { Entity, EntityWithoutRuntime } from './Entity';

// Oriented bounding box: a center point, half-extents along the three local axes, and an
// orientation quaternion (x, y, z, w) mapping local axes to world space. A half-extent of
// zero on any axis collapses that dimension to a slab or point.
export interface Obb extends Entity {
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
