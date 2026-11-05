import type { RendererData } from '@flighthq/node/contract';

import type { Scene2DTexture } from './Scene2DTexture.ts';
export interface SpriteIdentityRendererData extends RendererData {
  textureIdentity: Scene2DTexture | null;
  textureVersion: number;
}
