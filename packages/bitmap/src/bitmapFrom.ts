import { createEntity } from '@flighthq/entity/contract';
import type { Bitmap, HasGraphicsBitmapReadback, ImageResource } from '@flighthq/types/contract';
import { BitmapTextureSourceKind } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

export function captureBitmapFromImageResource(
  host: Readonly<HasGraphicsBitmapReadback>,
  resource: Readonly<ImageResource>,
): Bitmap | null {
  return createBitmapFromImageSource(host, resource.source, resource.width, resource.height);
}

export function createBitmapFromCanvas(
  canvas: HTMLCanvasElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): Bitmap {
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  const raw = ctx.getImageData(x, y, w, h);
  return createEntity({
    alphaType: 'straight',
    gamut: raw.colorSpace as 'srgb' | 'display-p3',
    data: raw.data,
    format: 'rgba8unorm',
    height: raw.height,
    kind: BitmapTextureSourceKind,
    version: 0,
    width: raw.width,
  });
}

export function createBitmapFromImageSource(
  host: Readonly<HasGraphicsBitmapReadback>,
  source: CanvasImageSource,
  width: number,
  height: number,
): Bitmap | null {
  return resolveBitmapReadback(host, source, width, height, 'bitmap').bitmap;
}
