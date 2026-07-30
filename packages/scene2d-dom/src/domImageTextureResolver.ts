import type { DomRenderState, ImageResource, Texture } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { registerDomTextureResolver } from './domTextureResolver';

export function registerDomImageTextureResolver(state: DomRenderState): void {
  registerDomTextureResolver(state, ImageTextureSourceKind, resolveDomImageTexture);
}

function resolveDomImageTexture(_state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (texture.storage.image as Readonly<ImageResource> | null)?.source ?? null;
}
