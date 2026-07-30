import { getTextureSource } from '@flighthq/texture/contract';
import type { CanvasRenderState, Image, Texture } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasImageTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, ImageTextureSourceKind, resolveCanvasImageTexture);
}

function resolveCanvasImageTexture(_state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (getTextureSource(texture) as Readonly<Image> | null)?.source ?? null;
}
