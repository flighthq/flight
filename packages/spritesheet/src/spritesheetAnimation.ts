import { createEntity } from '@flighthq/foundation';
import type { SpritesheetAnimation } from '@flighthq/types';

export function createSpritesheetAnimation(obj?: Partial<SpritesheetAnimation>): SpritesheetAnimation {
  return createEntity({
    frameDuration: obj?.frameDuration ?? 0,
    frames: obj?.frames ?? [],
    loop: obj?.loop ?? false,
    originX: obj?.originX ?? 0,
    originY: obj?.originY ?? 0,
  });
}
