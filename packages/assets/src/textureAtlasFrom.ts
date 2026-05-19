import type { ImageSource, TextureAtlas } from '@flighthq/types';

import { imageSourceFromCanvas, imageSourceFromImageBitmap, imageSourceFromImageElement } from './imageSourceFrom';
import { createTextureAtlas } from './textureAtlas';

export function textureAtlasFromCanvas(canvas: HTMLCanvasElement): TextureAtlas {
  return createTextureAtlas({ image: imageSourceFromCanvas(canvas) });
}

export function textureAtlasFromImageBitmap(bitmap: ImageBitmap): TextureAtlas {
  return createTextureAtlas({ image: imageSourceFromImageBitmap(bitmap) });
}

export function textureAtlasFromImageElement(img: HTMLImageElement): TextureAtlas {
  return createTextureAtlas({ image: imageSourceFromImageElement(img) });
}

export function textureAtlasFromImageSource(source: ImageSource): TextureAtlas {
  return createTextureAtlas({ image: source });
}
