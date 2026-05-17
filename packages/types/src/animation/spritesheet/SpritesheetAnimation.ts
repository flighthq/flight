import type { Entity } from '../../foundation';

export interface SpritesheetAnimation extends Entity {
  frames: number[];
  frameDuration: number;
  loop: boolean;
  originX: number;
  originY: number;
}
