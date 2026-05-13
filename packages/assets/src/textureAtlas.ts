import { createEntity } from '@flighthq/foundation';
import type { TextureAtlas } from '@flighthq/types';

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return createEntity({
    image: obj?.image ?? null,
    regions: obj?.regions ?? [],
  });
}
