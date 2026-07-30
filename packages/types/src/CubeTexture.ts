import type { Texture } from './Texture';
import type { TextureStorage } from './TextureStorage';

export interface CubeTexture extends Texture {
  storage: Extract<TextureStorage, { dimension: 'cube' }>;
}
