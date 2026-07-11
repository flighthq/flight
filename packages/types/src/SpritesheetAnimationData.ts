import type { SpritesheetAnimationDirection } from './SpritesheetAnimationDirection';

export interface SpritesheetAnimationData {
  direction: SpritesheetAnimationDirection;
  frameDuration: number;
  frameDurations: number[] | null;
  frameNames: string[];
  loop: boolean;
  name: string;
  originX: number;
  originY: number;
}
