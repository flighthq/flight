import type { Entity, EntityWithoutRuntime } from '../foundation';

export interface Rectangle extends Entity {
  height: number;
  width: number;
  x: number;
  y: number;
}

export type RectangleLike = EntityWithoutRuntime<Rectangle>;
