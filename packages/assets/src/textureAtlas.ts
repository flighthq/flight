import type { TextureAtlas } from '@flighthq/types';

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return {
    image: obj?.image ?? null,
    regions: obj?.regions ?? [],
  };
}
