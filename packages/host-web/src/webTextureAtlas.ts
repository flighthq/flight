import { createTexture } from '@flighthq/texture/contract';
import { createTextureAtlas } from '@flighthq/textureatlas/contract';
import type { TextureAtlas } from '@flighthq/types/contract';

import {
  createImageResourceFromCanvas,
  createImageResourceFromImageBitmap,
  createImageResourceFromImageElement,
} from './webImageResource';

// One-step atlases over the three web drawables. The portable half —
// createTextureAtlasFromImageResource and the loaders — stays in @flighthq/textureatlas; only these,
// which name a browser type in their signature, belong to the web host.

export function createTextureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromCanvas(canvas) }),
  });
}

export function createTextureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromImageBitmap(bitmap) }),
  });
}

export function createTextureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({
    texture: createTexture({ dimension: '2d', source: createImageResourceFromImageElement(img) }),
  });
}
