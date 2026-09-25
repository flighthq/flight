import type { Entity, EntityWithoutRuntime } from './Entity.ts';

export interface Matrix4 extends Entity {
  readonly m: Float32Array;
}

export type Matrix4Like = EntityWithoutRuntime<Matrix4>;
