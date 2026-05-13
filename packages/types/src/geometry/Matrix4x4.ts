import type { Entity, EntityWithoutRuntime } from '../foundation';

export interface Matrix4x4 extends Entity {
  readonly m: Float32Array;
}

export type Matrix4x4Like = EntityWithoutRuntime<Matrix4x4>;
