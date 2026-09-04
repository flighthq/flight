import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Bitmap, EntityConstruction, HasGraphicsBitmapReadback, ImageResource } from '@flighthq/types/contract';
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
  const out = allocateEntity<Bitmap>();
  initializeBitmapFromCanvas(out, canvas, x, y, width, height);
  return finishEntity(out);
}

export function createBitmapFromImageSource(
  host: Readonly<HasGraphicsBitmapReadback>,
  source: CanvasImageSource,
  width: number,
  height: number,
): Bitmap | null {
  return resolveBitmapReadback(host, source, width, height, 'bitmap').bitmap;
}

export function initializeBitmapFromCanvas(
  out: EntityConstruction<Bitmap>,
  canvas: HTMLCanvasElement,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
): void {
  const w = width ?? canvas.width;
  const h = height ?? canvas.height;
  const ctx = canvas.getContext('2d')!;
  const raw = ctx.getImageData(x, y, w, h);
  out.alphaType = 'straight';
  out.gamut = raw.colorSpace as 'srgb' | 'display-p3';
  out.data = raw.data;
  out.format = 'rgba8unorm';
  out.height = raw.height;
  out.kind = BitmapTextureSourceKind;
  out.version = 0;
  out.width = raw.width;
}
