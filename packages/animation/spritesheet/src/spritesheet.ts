import { createEntity } from '@flighthq/foundation';
import type { Spritesheet } from '@flighthq/types';

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return createEntity({
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? [],
  });
}
