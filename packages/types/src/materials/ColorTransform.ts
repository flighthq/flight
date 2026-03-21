import type { Entity } from '../core';

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
