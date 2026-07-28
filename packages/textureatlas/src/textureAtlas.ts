import { createEntity } from '@flighthq/entity/contract';
import { getImageResourceByteSize } from '@flighthq/image/contract';
import type { TextureAtlas } from '@flighthq/types/contract';

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return createEntity({
    regions: obj?.regions ?? [],
    texture: obj?.texture ?? null,
  });
}

// Returns the byte footprint of the atlas Texture's CPU-side image data. Produced and unbound
// textures have no CPU footprint.
export function getTextureAtlasByteSize(atlas: Readonly<TextureAtlas>): number {
  const texture = atlas.texture;
  if (texture === null || texture.storage.dimension !== '2d' || texture.storage.image === null) return 0;
  return getImageResourceByteSize(texture.storage.image);
}
