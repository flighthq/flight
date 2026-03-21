import { createEntity } from '@flighthq/core';
import type { Spritesheet } from '@flighthq/types';

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return createEntity({
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? [],
  });
}
