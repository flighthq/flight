import type { Entity } from './Entity';
import type { Signal } from './Signal';
import type { SpritesheetAnimation } from './SpritesheetAnimation';

export interface SpritesheetPlayer extends Entity {
  animation: SpritesheetAnimation | null;
  complete: boolean;
  elapsed: number;
  paused: boolean;
  speed: number;
  frameIndex: number;
  onComplete: Signal<() => void>;
  onLoop: Signal<() => void>;
  queue: SpritesheetAnimation[];
}
