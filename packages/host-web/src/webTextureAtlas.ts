import { createTexture } from '@flighthq/texture/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { TextureAtlas } from '@flighthq/types/contract';

import {
  createWebImageResourceFromCanvas,
  createWebImageResourceFromImageBitmap,
  createWebImageResourceFromImageElement,
} from './webImageResource';

// One-step atlases over the three web drawables. The portable half —
// createTextureAtlasFromImageResource and the loaders — stays in @flighthq/textureatlas; only these,
// which name a browser type in their signature, belong to the web host.

export function createWebTextureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(canvas) }),
  });
}

export function createWebTextureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createWebImageResourceFromImageBitmap(bitmap) }),
  });
}

export function createWebTextureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createWebImageResourceFromImageElement(img) }),
  });
}
