import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';

export interface Matrix extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

export type MatrixLike = EntityWithoutRuntime<Matrix>;

export interface Matrix3 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly m: Float32Array;
}

export type Matrix3Like = EntityWithoutRuntime<Matrix3>;

export interface Matrix4 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly m: Float32Array;
}

export type Matrix4Like = EntityWithoutRuntime<Matrix4>;

export interface Rectangle extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type RectangleLike = EntityWithoutRuntime<Rectangle>;

export interface Vector2 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
}

export type Vector2Like = EntityWithoutRuntime<Vector2>;
