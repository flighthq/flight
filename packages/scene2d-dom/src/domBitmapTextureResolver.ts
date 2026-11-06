import type { Bitmap } from '@flighthq/bitmap/contract';
import { createImageResourceFromBitmap } from '@flighthq/image/contract';
import type { HostImageCapability } from '@flighthq/image/contract';
import { getTextureSource } from '@flighthq/texture/contract';
import type { Texture } from '@flighthq/texture/contract';
import { BitmapTextureSourceKind } from '@flighthq/texture/contract';

import type { DomRenderState } from './contract.scene2d-dom-types.ts';
import { getDomRenderStateRuntime } from './domRenderState.ts';
import { registerDomTextureResolver } from './domTextureResolver.ts';

export function registerDomBitmapTextureResolver(
  hostImage: Readonly<HostImageCapability>,
  state: DomRenderState,
): void {
  registerDomTextureResolver(state, BitmapTextureSourceKind, (s, texture) =>
    resolveDomBitmapTexture(hostImage, s, texture),
  );
}

function resolveDomBitmapTexture(
  hostImage: Readonly<HostImageCapability>,
  state: DomRenderState,
  texture: Readonly<Texture>,
): CanvasImageSource | null {
  const bitmap = getTextureSource(texture) as Readonly<Bitmap> | null;
  if (bitmap === null) return null;

  const runtime = getDomRenderStateRuntime(state);
  const cache = (runtime.bitmapElementCache ??= new WeakMap());
  let entry = cache.get(bitmap);
  if (entry === undefined || entry.version !== bitmap.version) {
    const image = createImageResourceFromBitmap(hostImage, bitmap);
    if (image === null) return null;
    entry = { element: image.source as HTMLCanvasElement, version: bitmap.version };
    cache.set(bitmap, entry);
  }
  return entry.element;
}
