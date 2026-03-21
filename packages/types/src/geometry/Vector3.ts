import type { Entity, EntityWithoutRuntime } from '../core';

export interface Vector3 extends Entity {
  x: number;
  y: number;
  z: number;
}

export type Vector3Like = EntityWithoutRuntime<Vector3>;
