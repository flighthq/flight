import type { Entity } from '../foundation';
import type { ImageSource } from './ImageSource';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
  image: ImageSource | null;
  regions: TextureAtlasRegion[];
}
