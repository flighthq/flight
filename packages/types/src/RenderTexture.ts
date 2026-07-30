import type { Texture } from './Texture';
import type { TextureStorage } from './TextureStorage';
import type { TextureTargetBacking } from './TextureTargetBacking';

export interface RenderTexture extends Texture {
  storage: Extract<TextureStorage, { dimension: '2d' }> & {
    target: TextureTargetBacking;
  };
}
