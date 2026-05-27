import { createEntity } from '@flighthq/entity';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return createEntity({
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? {},
    frames: obj?.frames ?? [],
  });
}

export function getSpritesheetAnimation(spritesheet: Spritesheet, label: string): SpritesheetAnimation | null {
  return spritesheet.animations[label] ?? null;
}
