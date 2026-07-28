import { inverseMatrixTransformPointXY } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix } from '@flighthq/node/contract';
import { createSurfaceFromImageResource, getSurfacePixelChannel } from '@flighthq/surface/contract';
import type { Sprite, Node2D, ImageResource, NodeAny, Surface } from '@flighthq/types/contract';
import { SpriteKind, ImageChannel } from '@flighthq/types/contract';

import { hitTestGraphLocalBounds, registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for bitmaps: the `*Precise` queries then hit a Sprite only where its pixel
 * alpha meets `alphaThreshold` (0..255). Within the node's bounds but where the pixels aren't readable
 * (no image, a GPU-only texture, or a headless environment that can't rasterize), it falls back to a
 * bounds hit rather than throwing — best-available precision for that instance.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/surface`, so the base interaction bundle
 * stays free of it (tree-shaken unless referenced).
 */
export function registerSpriteHitTest(alphaThreshold: number = 1): void {
  registerHitTestPrecise(SpriteKind, (source, x, y) => hitTestSpriteAlpha(source, x, y, alphaThreshold));
}

// Returns 0 on a hit (opaque pixel, or bounds fallback when pixels are unreadable), -1 on a miss.
function hitTestSpriteAlpha(source: NodeAny, x: number, y: number, alphaThreshold: number): number {
  if (!hitTestGraphLocalBounds(source, x, y)) return -1;

  const sprite = source as Sprite;
  const texture = sprite.data.texture;
  if (texture === null || texture.storage.dimension !== '2d') return 0;
  const image = texture.storage.image;
  if (image === null) return 0;

  const surface = surfaceForImage(image);
  if (surface === null) return 0;

  inverseMatrixTransformPointXY(bitmapAlphaLocalPoint, getNodeWorldMatrix(source as Node2D), x, y);
  const px = Math.floor(texture.uvOffset.x * image.width + bitmapAlphaLocalPoint.x);
  const py = Math.floor(texture.uvOffset.y * image.height + bitmapAlphaLocalPoint.y);
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
