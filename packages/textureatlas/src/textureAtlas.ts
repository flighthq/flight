import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, CompressedImageResource, TextureAtlas } from '@flighthq/types/contract';
import { BitmapTextureSourceKind, CompressedImageTextureSourceKind } from '@flighthq/types/contract';

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return createEntity({
    imageHeight: obj?.imageHeight ?? 0,
    imageName: obj?.imageName ?? null,
    imageWidth: obj?.imageWidth ?? 0,
    regions: obj?.regions ?? [],
    scale: obj?.scale ?? 1,
    texture: obj?.texture ?? null,
  });
}

// Releases what keeps the atlas reachable: drops its regions and its texture reference. The texture
// itself is not destroyed — the caller supplied it to createTextureAtlas and may still be using it
// elsewhere, and freeing GPU resources is `@flighthq/texture`'s `destroy*` to perform, not this
// package's to assume. After this the atlas is empty and reusable, not invalid.
export function disposeTextureAtlas(atlas: TextureAtlas): void {
  atlas.regions.length = 0;
  atlas.texture = null;
}

// Returns the byte footprint of the atlas Texture's CPU-side image data. Produced and unbound
// textures have no CPU footprint.
export function getTextureAtlasByteSize(atlas: Readonly<TextureAtlas>): number {
  const texture = atlas.texture;
  if (texture === null || texture.dimension !== '2d' || texture.source === null) return 0;
  const image = texture.source;
  if (image.kind === BitmapTextureSourceKind) return (image as Readonly<Bitmap>).data.byteLength;
  if (image.kind === CompressedImageTextureSourceKind) {
    return (image as Readonly<CompressedImageResource>).compressed.payload.byteLength;
  }
  return 0;
}
