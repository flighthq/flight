import type { ImageResource } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import { ImageTextureSourceKind } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/texture/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver.ts';
import type { CanvasTextureResolvers } from './types/CanvasTextureResolver.ts';

export function registerCanvasImageTextureResolver(resolvers: CanvasTextureResolvers): void {
  registerCanvasTextureResolver(resolvers, ImageTextureSourceKind, resolveCanvasImageTexture);
}

function resolveCanvasImageTexture(
  _resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  return (getTextureSource(texture) as Readonly<ImageResource> | null)?.source ?? null;
}
