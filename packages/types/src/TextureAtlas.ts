import type { Entity } from './Entity';
import type { Texture2D } from './Texture';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
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
