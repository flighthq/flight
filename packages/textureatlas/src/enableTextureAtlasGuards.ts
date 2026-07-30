import { logOnce } from '@flighthq/log/contract';
import type { TextureAtlas, TextureAtlasRegionTextureExplanation } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { setTextureAtlasRegionTextureGuard } from './textureAtlasRegion';

export function areTextureAtlasGuardsEnabled(): boolean {
  return textureAtlasGuardsEnabled;
}

export function disableTextureAtlasGuards(): void {
  setTextureAtlasRegionTextureGuard(null);
  textureAtlasGuardsEnabled = false;
}

export function enableTextureAtlasGuards(): void {
  setTextureAtlasRegionTextureGuard(warnTextureAtlasRegionTextureUnavailable);
  textureAtlasGuardsEnabled = true;
}

function warnTextureAtlasRegionTextureUnavailable(
  atlas: Readonly<TextureAtlas>,
  regionId: number,
  explanation: Readonly<TextureAtlasRegionTextureExplanation>,
): void {
  if (explanation.status !== 'rotated-page') return;
  logOnce(
    'textureatlas:region-texture-rotated-page',
    LogLevel.Warn,
    {
      atlas,
      message:
        'getTextureAtlasRegionTexture: a page Texture with nonzero uvRotation cannot compose a region without shear; use an unrotated page window.',
      regionId,
      status: explanation.status,
    },
    'textureatlas',
  );
}

let textureAtlasGuardsEnabled = false;
