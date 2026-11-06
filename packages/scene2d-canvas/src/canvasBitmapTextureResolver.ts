import type { Bitmap } from '@flighthq/bitmap/contract';
import { createImageResourceFromBitmap } from '@flighthq/image/contract';
import type { HostImageCapability } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import { BitmapTextureSourceKind } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/texture/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver.ts';
import type { CanvasTextureResolvers } from './types/CanvasTextureResolver.ts';

export function registerCanvasBitmapTextureResolver(
  hostImage: Readonly<HostImageCapability>,
  resolvers: CanvasTextureResolvers,
): void {
  registerCanvasTextureResolver(resolvers, BitmapTextureSourceKind, (r, texture) =>
    resolveCanvasBitmapTexture(hostImage, r, texture),
  );
}

function resolveCanvasBitmapTexture(
  hostImage: Readonly<HostImageCapability>,
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  if (bitmap === null) return null;

  const cache = (resolvers.bitmapElementCache ??= new WeakMap());
  let entry = cache.get(bitmap);
  if (entry === undefined || entry.version !== bitmap.version) {
    const image = createImageResourceFromBitmap(hostImage, bitmap);
    if (image === null) return null;
    entry = { element: image.source as HTMLCanvasElement, version: bitmap.version };
    cache.set(bitmap, entry);
  }
  return entry.element;
}
