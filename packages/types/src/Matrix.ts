import type { Entity, EntityWithoutRuntime } from './Entity.ts';

export interface Matrix extends Entity {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export type MatrixLike = EntityWithoutRuntime<Matrix>;
