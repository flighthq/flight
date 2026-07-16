import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { createSurfaceFromImageResource, getSurfacePixelChannel } from '@flighthq/surface';
import type { Bitmap, DisplayObject, ImageResource, NodeAny, Surface } from '@flighthq/types';
import { BitmapKind, ImageChannel } from '@flighthq/types';

import { hitTestGraphLocalBounds, registerHitTestPoint } from './hitTests';

/**
 * Opt-in Tier-2 accuracy for bitmaps: replaces the coarse Bitmap hit handler with an alpha-accurate one,
 * so a hit counts only where the bitmap's pixel alpha meets `alphaThreshold` (0..255). Tier-1
 * (`shapeFlag=false`) stays the cheap bounds box; the pixel read runs only under `shapeFlag`.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/surface`, so the base interaction bundle
 * stays free of it (tree-shaken unless referenced). Requires the image's pixels to be CPU-readable (a
 * decoded / canvas-backed `ImageResource`); where they are not (e.g. a GPU-only texture, or a headless
 * environment that cannot rasterize), it falls back to the bounds box rather than throwing.
 */
export function registerAccurateBitmapHitTest(alphaThreshold: number = 1): void {
  registerHitTestPoint(BitmapKind, (source, x, y, shapeFlag) =>
    hitTestBitmapAlpha(source, x, y, shapeFlag, alphaThreshold),
  );
}

function hitTestBitmapAlpha(
  source: NodeAny,
  x: number,
  y: number,
  shapeFlag: boolean,
  alphaThreshold: number,
): boolean {
  // Broad-phase reject, then the coarse tier stops here.
  if (!hitTestGraphLocalBounds(source, x, y)) return false;
  if (!shapeFlag) return true;

  const bitmap = source as Bitmap;
  const image = bitmap.data.image;
  if (image === null) return true;

  const surface = surfaceForImage(image);
  if (surface === null) return true;

  inverseMatrixTransformPointXY(bitmapAlphaLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  const rect = bitmap.data.sourceRectangle;
  const px = Math.floor(bitmapAlphaLocalPoint.x + (rect !== null ? rect.x : 0));
  const py = Math.floor(bitmapAlphaLocalPoint.y + (rect !== null ? rect.y : 0));
  if (px < 0 || py < 0 || px >= surface.width || py >= surface.height) return false;
  return getSurfacePixelChannel(surface, px, py, ImageChannel.Alpha) >= alphaThreshold;
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
