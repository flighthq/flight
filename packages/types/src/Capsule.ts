import type { Entity, EntityWithoutRuntime } from './Entity';

// A capsule: the set of all points within `radius` of the line segment from (startX, startY,
// startZ) to (endX, endY, endZ). A negative radius conventionally marks an empty capsule.
export interface Capsule extends Entity {
  endX: number;
  endY: number;
  endZ: number;
  radius: number;
  startX: number;
  startY: number;
  startZ: number;
}

export type CapsuleLike = EntityWithoutRuntime<Capsule>;
