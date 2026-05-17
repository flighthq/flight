import type { SpritesheetAnimation } from './SpritesheetAnimation';

export interface SpritesheetPlayer {
  animation: SpritesheetAnimation | null;
  complete: boolean;
  elapsed: number;
  frameIndex: number;
  queue: SpritesheetAnimation[];
}
