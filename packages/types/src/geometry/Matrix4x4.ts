import type { Entity, EntityWithoutRuntime } from '../core';

export interface Matrix4x4 extends Entity {
  readonly m: Float32Array;
}

export type Matrix4x4Like = EntityWithoutRuntime<Matrix4x4>;
