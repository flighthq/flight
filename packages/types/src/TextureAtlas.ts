import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';
import type { Texture2D } from '@flighthq/texture/contract';

import type { TextureAtlasRegion } from './TextureAtlasRegion.ts';

export interface TextureAtlas extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  // Page metadata the descriptor formats carry and a consumer needs after parsing: the image file to
  // fetch, and the dimensions getTextureAtlasRegionUv divides by. Zero width or height means the
  // document declared none — Starling XML carries no atlas metadata at all — and is deliberately not
  // a plausible-looking size a UV caller would use without checking.
  imageHeight: number;
  imageName: string | null;
  imageWidth: number;
  regions: TextureAtlasRegion[];
  // The scale the atlas was exported at (TexturePacker `meta.scale`). 1 when undeclared.
  scale: number;
  texture: Texture2D | null;
}
