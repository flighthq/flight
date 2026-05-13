import type { Entity } from '../../foundation';

export interface SpritesheetAnimation extends Entity {
  frames: number[];
  frameDuration: number;
  label: string | null;
  loop: boolean;
}
