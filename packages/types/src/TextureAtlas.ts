import type { Entity } from './Entity';
import type { ImageSource } from './ImageSource';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
  image: ImageSource | null;
  regions: TextureAtlasRegion[];
}
