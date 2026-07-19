import type { Entity, EntityWithoutRuntime } from './Entity';

// Decomposed 2D affine transform carrier — the passable, one-operation-assignable form of a
// display object's local transform. Same fields the `HasTransform2D` node trait exposes; a node is
// `Transform2DLike`. Round-trips losslessly with `Matrix` (2D is 6-DOF complete: skew spans the full
// affine). `rotation`/`skewX`/`skewY` are degrees (authoring layer), converted at the geometry seam.
export interface Transform2D extends Entity {
  pivotX: number;
  pivotY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  x: number;
  y: number;
}

export type Transform2DLike = EntityWithoutRuntime<Transform2D>;
