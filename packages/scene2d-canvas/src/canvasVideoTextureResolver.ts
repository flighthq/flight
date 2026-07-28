import type { CanvasRenderState, ImageResource, Texture } from '@flighthq/types/contract';
import { VideoTextureBackingKind } from '@flighthq/types/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasVideoTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, VideoTextureBackingKind, resolveCanvasVideoTexture);
}

function resolveCanvasVideoTexture(_state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (texture.storage.image as Readonly<ImageResource> | null)?.source ?? null;
}
