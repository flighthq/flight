import { extractBitmapPixels } from '@flighthq/bitmap/contract';
import type { BitmapRegion } from '@flighthq/types/contract';

export function drawBitmap(dest: HTMLCanvasElement, source: Readonly<BitmapRegion>, x: number, y: number): void {
  if (source.width <= 0 || source.height <= 0) return;
  const context = dest.getContext('2d')!;
  const domImageData = context.createImageData(source.width, source.height);
  extractBitmapPixels(domImageData.data, source);
  context.putImageData(domImageData, x, y);
}
