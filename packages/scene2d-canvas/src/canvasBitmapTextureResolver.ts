import { createImageResourceFromBitmap } from '@flighthq/image/contract';
import type { Bitmap, CanvasRenderState, Texture } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { getCanvasRenderStateRuntime } from './canvasRenderState';
import { registerCanvasTextureResolver } from './canvasTextureResolver';

export function registerCanvasBitmapTextureResolver(state: CanvasRenderState): void {
  registerCanvasTextureResolver(state, BitmapTextureSourceKind, resolveCanvasBitmapTexture);
}

function resolveCanvasBitmapTexture(state: CanvasRenderState, texture: Readonly<Texture>): CanvasImageSource | null {
  const bitmap = texture.storage.image as Readonly<Bitmap> | null;
  if (bitmap === null) return null;

  const runtime = getCanvasRenderStateRuntime(state);
  const cache = (runtime.bitmapElementCache ??= new WeakMap());
  let entry = cache.get(bitmap);
  if (entry === undefined || entry.version !== bitmap.version) {
    const image = createImageResourceFromBitmap(bitmap);
    entry = { element: image.source as HTMLCanvasElement, version: bitmap.version };
    cache.set(bitmap, entry);
  }
  return entry.element;
}
