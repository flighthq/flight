import type { BitmapRegion } from '@flighthq/types/contract';

import { extractBitmapPixels } from './bitmapComposite';

/**
 * Draws the `source` region onto a 2D canvas at `(x, y)` via `putImageData`.
 * A region with a zero dimension is a no-op (`ImageData` requires positive
 * dimensions).
 */
export function drawBitmap(dest: HTMLCanvasElement, source: Readonly<BitmapRegion>, x: number, y: number): void {
  if (source.width <= 0 || source.height <= 0) return;
  const domImageData = new globalThis.ImageData(source.width, source.height);
  extractBitmapPixels(domImageData.data, source);
  dest.getContext('2d')!.putImageData(domImageData, x, y);
}
