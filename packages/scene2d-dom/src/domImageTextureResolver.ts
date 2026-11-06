import type { ImageResource } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/texture/contract';
import { ImageTextureSourceKind } from '@flighthq/texture/contract';

import type { DomRenderState } from './contract.scene2d-dom-types.ts';
import { registerDomTextureResolver } from './domTextureResolver.ts';

export function registerDomImageTextureResolver(state: DomRenderState): void {
  registerDomTextureResolver(state, ImageTextureSourceKind, resolveDomImageTexture);
}

function resolveDomImageTexture(_state: DomRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  return (getTextureSource(texture) as Readonly<ImageResource> | null)?.source ?? null;
}
