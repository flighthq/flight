import type { Entity } from '../../core';

export interface SpritesheetAnimation extends Entity {
  frames: number[];
  frameDuration: number;
  label: string | null;
  loop: boolean;
}
