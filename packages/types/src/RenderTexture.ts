import type { RenderTarget } from './RenderTarget';
import type { Texture2D } from './Texture';

export interface RenderTexture extends Texture2D {
  source: RenderTarget;
}
