import { createSprite } from '@flighthq/scene-graph-sprite';
import type { Sprite } from '@flighthq/types';

export interface Bunny extends Sprite {
  speedX: number;
  speedY: number;
}

export function createBunny(): Bunny {
  const out = createSprite() as Bunny;
  out.speedX = 0;
  out.speedY = 0;
  out.data.id = 0;
  return out;
}
