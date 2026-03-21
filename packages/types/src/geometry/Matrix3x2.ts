import type { Entity, EntityWithoutRuntime } from '../core';

export interface Matrix3x2 extends Entity {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export type Matrix3x2Like = EntityWithoutRuntime<Matrix3x2>;
