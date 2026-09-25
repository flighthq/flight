import type { RendererData } from './RendererData.ts';
import type { Texture } from './Texture.ts';

export interface SpriteIdentityRendererData extends RendererData {
  textureIdentity: Texture | null;
  textureVersion: number;
}
