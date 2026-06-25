import { createEntity } from '@flighthq/entity';
import { getImageResourceByteSize } from '@flighthq/image';
import type { TextureAtlas } from '@flighthq/types';

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return createEntity({
    image: obj?.image ?? null,
    regions: obj?.regions ?? [],
  });
}

// Returns the byte footprint of the atlas's CPU-side image data. Equivalent to calling
// `getImageResourceByteSize` on the atlas image; returns 0 when the image is null or element-only.
export function getTextureAtlasByteSize(atlas: Readonly<TextureAtlas>): number {
  return atlas.image !== null ? getImageResourceByteSize(atlas.image) : 0;
}
