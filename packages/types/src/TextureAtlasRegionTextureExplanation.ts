import type { TextureAtlas } from './TextureAtlas';

export type TextureAtlasRegionTextureStatus = 'ready' | 'missing-region' | 'missing-texture' | 'rotated-page';

export interface TextureAtlasRegionTextureExplanation {
  readonly status: TextureAtlasRegionTextureStatus;
}

export type TextureAtlasRegionTextureGuard = (
  atlas: Readonly<TextureAtlas>,
  regionId: number,
  explanation: Readonly<TextureAtlasRegionTextureExplanation>,
) => void;
