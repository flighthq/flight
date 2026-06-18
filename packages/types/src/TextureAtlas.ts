import type { Entity } from './Entity';
import type { ImageResource } from './ImageResource';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
  image: ImageResource | null;
  regions: TextureAtlasRegion[];
}
