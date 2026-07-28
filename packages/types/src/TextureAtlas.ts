import type { Entity } from './Entity';
import type { Texture } from './Texture';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas extends Entity {
  texture: Texture | null;
  regions: TextureAtlasRegion[];
}
