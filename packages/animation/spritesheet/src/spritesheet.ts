import type { Spritesheet } from '@flighthq/types';

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return {
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? [],
  };
}
