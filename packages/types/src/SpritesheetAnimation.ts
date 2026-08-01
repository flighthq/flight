import type { Entity } from './Entity';
import type { SpritesheetAnimationDirection } from './SpritesheetAnimationDirection';

export interface SpritesheetAnimation extends Entity {
  frames: number[];
  frameDuration: number;
  frameDurations: number[] | null;
  direction: SpritesheetAnimationDirection;
  /** Additional repetitions after the first playthrough. `-1` repeats indefinitely. */
  repeatCount: number;
  originX: number;
  originY: number;
}
