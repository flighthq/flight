import type { Entity, EntityWithoutRuntime } from './Entity';

export interface Matrix3 extends Entity {
  readonly m: Float32Array;
}

export type Matrix3Like = EntityWithoutRuntime<Matrix3>;
