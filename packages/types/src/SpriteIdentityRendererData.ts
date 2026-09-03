import type { RendererData } from './RendererData';
import type { Texture } from './Texture';

export interface SpriteIdentityRendererData extends RendererData {
  textureIdentity: Texture | null;
  textureVersion: number;
}
