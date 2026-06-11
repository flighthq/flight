import type { SurfaceRegion } from '@flighthq/types';

import { extractSurfacePixels } from './composite';

/**
 * Draws the `source` region onto a 2D canvas at `(x, y)` via `putImageData`.
 * A region with a zero dimension is a no-op (`ImageData` requires positive
 * dimensions).
 */
export function drawSurface(dest: HTMLCanvasElement, source: Readonly<SurfaceRegion>, x: number, y: number): void {
  if (source.width <= 0 || source.height <= 0) return;
  const domImageData = new globalThis.ImageData(source.width, source.height);
  extractSurfacePixels(domImageData.data, source);
  dest.getContext('2d')!.putImageData(domImageData, x, y);
}
