import { createEntity } from '@flighthq/core';
import type { SpritesheetAnimation } from '@flighthq/types';

export function createSpritesheetAnimation(obj?: Partial<SpritesheetAnimation>): SpritesheetAnimation {
  return createEntity({
    frameDuration: obj?.frameDuration ?? 0,
    frames: obj?.frames ?? [],
    label: obj?.label ?? null,
    loop: obj?.loop ?? false,
  });
}
