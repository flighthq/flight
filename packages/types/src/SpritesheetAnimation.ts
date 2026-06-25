import type { Entity } from './Entity';
import type { SpritesheetAnimationDirection } from './SpritesheetAnimationDirection';

export interface SpritesheetAnimation extends Entity {
  frames: number[];
  frameDuration: number;
  frameDurations: number[] | null;
  direction: SpritesheetAnimationDirection;
  loop: boolean;
  originX: number;
  originY: number;
}
