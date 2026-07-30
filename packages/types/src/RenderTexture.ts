import type { RenderTarget } from './RenderTarget';
import type { Texture } from './Texture';
import type { TextureStorage } from './TextureStorage';

export interface RenderTexture extends Texture {
  storage: Extract<TextureStorage, { dimension: '2d' }> & {
    target: RenderTarget;
  };
}
