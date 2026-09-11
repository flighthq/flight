import { captureBitmapFromImageResource, getBitmapPixelChannel } from '@flighthq/bitmap/contract';
import { inverseMatrixTransformPointXY } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix } from '@flighthq/node/contract';
import type {
  Bitmap,
  HostBitmapReadbackProvider,
  ImageResource,
  Node2D,
  NodeAny,
  Sprite,
  TextureSource,
} from '@flighthq/types/contract';
import { BitmapTextureSourceKind, ImageChannel, ImageTextureSourceKind, SpriteKind } from '@flighthq/types/contract';

import { hitTestGraphLocalBounds, registerHitTestPrecise } from './hitTests';

export function registerSpriteHitTest(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  alphaThreshold: number = 1,
): void {
  registerHitTestPrecise(SpriteKind, (source, x, y) =>
    hitTestSpriteAlpha(hostBitmapReadback, source, x, y, alphaThreshold),
  );
}

// Returns 0 on a hit (opaque pixel, or bounds fallback when pixels are unreadable), -1 on a miss.
function hitTestSpriteAlpha(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  source: NodeAny,
  x: number,
  y: number,
  alphaThreshold: number,
): number {
  if (!hitTestGraphLocalBounds(source, x, y)) return -1;

  const sprite = source as Sprite;
  const texture = sprite.data.texture;
  if (texture === null || texture.dimension !== '2d') return 0;
  const image = texture.source;
  if (image === null) return 0;

  const bitmap = bitmapForImage(hostBitmapReadback, image);
  if (bitmap === null) return 0;

  inverseMatrixTransformPointXY(bitmapAlphaLocalPoint, getNodeWorldMatrix(source as Node2D), x, y);
  const px = Math.floor(texture.uvOffset.x * image.width + bitmapAlphaLocalPoint.x);
  const py = Math.floor(texture.uvOffset.y * image.height + bitmapAlphaLocalPoint.y);
  if (px < 0 || py < 0 || px >= bitmap.width || py >= bitmap.height) return -1;
  return getBitmapPixelChannel(bitmap, px, py, ImageChannel.Alpha) >= alphaThreshold ? 0 : -1;
}

function bitmapForImage(hostBitmapReadback: Readonly<HostBitmapReadbackProvider>, image: TextureSource): Bitmap | null {
  if (image.kind === BitmapTextureSourceKind) return image as Bitmap;
  if (image.kind !== ImageTextureSourceKind) return null;
  const resource = image as ImageResource;
  const cached = bitmapCache.get(resource);
  if (cached !== undefined) return cached;
  const bitmap = captureBitmapFromImageResource(hostBitmapReadback, resource);
  // Cache only successes so an image that is not yet readable is retried later.
  if (bitmap !== null) bitmapCache.set(resource, bitmap);
  return bitmap;
}

const bitmapAlphaLocalPoint = { x: 0, y: 0 };
const bitmapCache = new WeakMap<ImageResource, Bitmap>();
