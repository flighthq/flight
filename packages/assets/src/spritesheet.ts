import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return {
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? [],
  };
}

export function createSpritesheetAnimation(obj?: Partial<SpritesheetAnimation>): SpritesheetAnimation {
  return {
    frameDuration: obj?.frameDuration ?? 0,
    frames: obj?.frames ?? [],
    label: obj?.label ?? null,
    loop: obj?.loop ?? false,
  };
}
