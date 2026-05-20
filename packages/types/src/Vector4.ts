import type { Entity, EntityWithoutRuntime } from './Entity';

export interface Vector4 extends Entity {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Vector4Like = EntityWithoutRuntime<Vector4>;
