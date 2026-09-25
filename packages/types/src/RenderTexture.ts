import type { RenderTarget } from './RenderTarget.ts';
import type { Texture2D } from './Texture.ts';

export interface RenderTexture extends Texture2D {
  source: RenderTarget;
}
