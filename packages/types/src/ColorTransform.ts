import type { Entity, EntityWithoutRuntime } from './Entity';

export interface ColorTransform extends Entity {
  alphaMultiplier: number;
  alphaOffset: number;
  blueMultiplier: number;
  blueOffset: number;
  greenMultiplier: number;
  greenOffset: number;
  redMultiplier: number;
  redOffset: number;
}

export type ColorTransformLike = EntityWithoutRuntime<ColorTransform>;
