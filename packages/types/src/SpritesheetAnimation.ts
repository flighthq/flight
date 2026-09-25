import type { Entity } from './Entity.ts';
import type { SpritesheetAnimationDirection } from './SpritesheetAnimationDirection.ts';

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
