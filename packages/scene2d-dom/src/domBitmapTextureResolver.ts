import { createImageResourceFromBitmap } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Bitmap, DomRenderState, HasGraphicsImage, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { getDomRenderStateRuntime } from './domRenderState';
import { registerDomTextureResolver } from './domTextureResolver';

export function registerDomBitmapTextureResolver(host: Readonly<HasGraphicsImage>, state: DomRenderState): void {
  registerDomTextureResolver(state, BitmapTextureSourceKind, (s, texture) => resolveDomBitmapTexture(host, s, texture));
}

function resolveDomBitmapTexture(
  host: Readonly<HasGraphicsImage>,
  state: DomRenderState,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  if (bitmap === null) return null;

  const runtime = getDomRenderStateRuntime(state);
  const cache = (runtime.bitmapElementCache ??= new WeakMap());
  let entry = cache.get(bitmap);
  if (entry === undefined || entry.version !== bitmap.version) {
    const image = createImageResourceFromBitmap(host, bitmap);
    if (image === null) return null;
    entry = { element: image.source as HTMLCanvasElement, version: bitmap.version };
    cache.set(bitmap, entry);
  }
  return entry.element;
}
