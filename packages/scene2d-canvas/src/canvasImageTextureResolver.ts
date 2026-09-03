import { getTextureSource } from '@flighthq/texture/contract';
import type { CanvasTextureResolvers, ImageResource, Texture } from '@flighthq/types/contract';
import { ImageTextureSourceKind } from '@flighthq/types/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasImageTextureResolver(resolvers: CanvasTextureResolvers): void {
  registerCanvasTextureResolver(resolvers, ImageTextureSourceKind, resolveCanvasImageTexture);
}

function resolveCanvasImageTexture(
  _resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  return (getTextureSource(texture) as Readonly<ImageResource> | null)?.source ?? null;
}
