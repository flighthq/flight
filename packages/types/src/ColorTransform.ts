import type { Entity } from './Entity';

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
