import type { ImageSource } from './ImageSource';
import type { TextureAtlasRegion } from './TextureAtlasRegion';

export interface TextureAtlas {
  image: ImageSource | null;
  regions: TextureAtlasRegion[];
}
