import type { Entity, EntityWithoutRuntime } from './Entity';

export interface Matrix3x3 extends Entity {
  readonly m: Float32Array;
}

export type Matrix3x3Like = EntityWithoutRuntime<Matrix3x3>;
