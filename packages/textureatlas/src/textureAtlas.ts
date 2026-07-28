import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, CompressedImage, TextureAtlas } from '@flighthq/types/contract';
import { BitmapTextureBackingKind, CompressedImageTextureBackingKind } from '@flighthq/types/contract';

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
  const image = texture.storage.image;
  if (image.kind === BitmapTextureBackingKind) return (image as Readonly<Bitmap>).data.byteLength;
  if (image.kind === CompressedImageTextureBackingKind) {
    return (image as Readonly<CompressedImage>).compressed.payload.byteLength;
  }
  return 0;
}
