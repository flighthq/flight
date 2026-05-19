import type { Spritesheet, Tileset } from '@flighthq/types';

import { createSpritesheet } from './spritesheet';
import { createSpritesheetFrame } from './spritesheetFrame';

export function createSpritesheetFromTileset(tileset: Tileset): Spritesheet {
  const { atlas } = tileset;
  const frames = (atlas?.regions ?? []).map((region) => createSpritesheetFrame({ id: region.id }));
  return createSpritesheet({ atlas, frames });
}
