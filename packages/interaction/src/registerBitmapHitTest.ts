import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { createSurfaceFromImageResource, getSurfacePixelChannel } from '@flighthq/surface';
import type { Bitmap, DisplayObject, ImageResource, NodeAny, Surface } from '@flighthq/types';
import { BitmapKind, ImageChannel } from '@flighthq/types';

import { hitTestGraphLocalBounds, registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for bitmaps: the `*Precise` queries then hit a Bitmap only where its pixel
 * alpha meets `alphaThreshold` (0..255). Within the node's bounds but where the pixels aren't readable
 * (no image, a GPU-only texture, or a headless environment that can't rasterize), it falls back to a
 * bounds hit rather than throwing — best-available precision for that instance.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/surface`, so the base interaction bundle
 * stays free of it (tree-shaken unless referenced).
 */
export function registerBitmapHitTest(alphaThreshold: number = 1): void {
  registerHitTestPrecise(BitmapKind, (source, x, y) => hitTestBitmapAlpha(source, x, y, alphaThreshold));
}

// Returns 0 on a hit (opaque pixel, or bounds fallback when pixels are unreadable), -1 on a miss.
function hitTestBitmapAlpha(source: NodeAny, x: number, y: number, alphaThreshold: number): number {
  if (!hitTestGraphLocalBounds(source, x, y)) return -1;

  const bitmap = source as Bitmap;
  const image = bitmap.data.image;
  if (image === null) return 0;

  const surface = surfaceForImage(image);
  if (surface === null) return 0;

  inverseMatrixTransformPointXY(bitmapAlphaLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  const rect = bitmap.data.sourceRectangle;
  const px = Math.floor(bitmapAlphaLocalPoint.x + (rect !== null ? rect.x : 0));
  const py = Math.floor(bitmapAlphaLocalPoint.y + (rect !== null ? rect.y : 0));
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) return -1;
  return getSurfacePixelChannel(surface, px, py, ImageChannel.Alpha) >= alphaThreshold ? 0 : -1;
}

function surfaceForImage(image: ImageResource): Surface | null {
  const cached = surfaceCache.get(image);
  if (cached !== undefined) return cached;
  let surface: Surface | null = null;
  try {
    surface = createSurfaceFromImageResource(image);
  } catch {
    surface = null;
  }
  // Cache only successes so an image that is not yet readable is retried later.
  if (surface !== null) surfaceCache.set(image, surface);
  return surface;
}

const bitmapAlphaLocalPoint = { x: 0, y: 0 };
const surfaceCache = new WeakMap<ImageResource, Surface>();
