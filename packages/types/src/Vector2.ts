import type { Entity, EntityWithoutRuntime } from './Entity';

export interface Vector2 extends Entity {
  x: number;
  y: number;
}

export type Vector2Like = EntityWithoutRuntime<Vector2>;
