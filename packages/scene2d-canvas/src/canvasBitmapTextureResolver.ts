import { createImageResourceFromBitmap } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Bitmap, CanvasTextureResolvers, HasGraphicsImage, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasBitmapTextureResolver(
  host: Readonly<HasGraphicsImage>,
  resolvers: CanvasTextureResolvers,
): void {
  registerCanvasTextureResolver(resolvers, BitmapTextureSourceKind, (r, texture) =>
    resolveCanvasBitmapTexture(host, r, texture),
  );
}

function resolveCanvasBitmapTexture(
  host: Readonly<HasGraphicsImage>,
  resolvers: CanvasTextureResolvers,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  if (bitmap === null) return null;

  const cache = (resolvers.bitmapElementCache ??= new WeakMap());
  let entry = cache.get(bitmap);
  if (entry === undefined || entry.version !== bitmap.version) {
    const image = createImageResourceFromBitmap(host, bitmap);
    if (image === null) return null;
    entry = { element: image.source as HTMLCanvasElement, version: bitmap.version };
    cache.set(bitmap, entry);
  }
  return entry.element;
}
