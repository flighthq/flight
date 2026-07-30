import type { DomRenderState, ImageResource, Texture } from '@flighthq/types/contract';
import { VideoTextureSourceKind } from '@flighthq/types/contract';

import { registerDomTextureResolver } from './domTextureResolver';

export function registerDomVideoTextureResolver(state: DomRenderState): void {
  registerDomTextureResolver(state, VideoTextureSourceKind, resolveDomVideoTexture);
}

function resolveDomVideoTexture(_state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (texture.storage.image as Readonly<ImageResource> | null)?.source ?? null;
}
