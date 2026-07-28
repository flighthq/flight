import type { DomRenderState, ImageResource, Texture } from '@flighthq/types/contract';
import { ImageTextureBackingKind } from '@flighthq/types/contract';

import { registerDomTextureResolver } from './domTextureResolver';

export function registerDomImageTextureResolver(state: DomRenderState): void {
  registerDomTextureResolver(state, ImageTextureBackingKind, resolveDomImageTexture);
}

function resolveDomImageTexture(_state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (texture.storage.image as Readonly<ImageResource> | null)?.source ?? null;
}
