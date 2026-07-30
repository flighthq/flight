import type { CanvasRenderState, ImageResource, Texture } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasImageTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, ImageTextureSourceKind, resolveCanvasImageTexture);
}

function resolveCanvasImageTexture(_state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (texture.storage.image as Readonly<ImageResource> | null)?.source ?? null;
}
