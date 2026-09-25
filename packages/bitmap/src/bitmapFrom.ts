import type { Bitmap, HostBitmapReadbackCapability, HostImageSource, ImageResource } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver.ts';

export function captureBitmapFromImageResource(
  hostBitmapReadback: Readonly<HostBitmapReadbackCapability>,
  resource: Readonly<ImageResource>,
): Bitmap | null {
  return createBitmapFromImageSource(hostBitmapReadback, resource.source, resource.width, resource.height);
}

export function createBitmapFromImageSource(
  hostBitmapReadback: Readonly<HostBitmapReadbackCapability>,
  source: HostImageSource,
  width: number,
  height: number,
): Bitmap | null {
  return resolveBitmapReadback(hostBitmapReadback, source, width, height, 'bitmap').bitmap;
}
