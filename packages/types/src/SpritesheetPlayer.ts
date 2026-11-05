import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';
import type { SpritesheetAnimation } from './SpritesheetAnimation.ts';

export interface SpritesheetPlayer extends Entity {
  animation: SpritesheetAnimation | null;
  complete: boolean;
  elapsed: number;
  paused: boolean;
  speed: number;
  frameIndex: number;
  onComplete: Signal<void>;
  onLoop: Signal<void>;
  queue: SpritesheetAnimation[];
}
