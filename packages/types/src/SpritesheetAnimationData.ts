import type { SpritesheetAnimationDirection } from './SpritesheetAnimationDirection';

export interface SpritesheetAnimationData {
  direction: SpritesheetAnimationDirection;
  frameDuration: number;
  frameDurations: number[] | null;
  frameNames: string[];
  /** Additional repetitions after the first playthrough. `-1` repeats indefinitely. */
  repeatCount: number;
  name: string;
  originX: number;
  originY: number;
}
