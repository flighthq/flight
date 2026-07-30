import type { Entity } from './Entity';
import type { Texture2D } from './Texture';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
  texture: Texture2D | null;
  regions: TextureAtlasRegion[];
}
