import type { Bitmap, HostBitmapReadbackProvider, HostImageSource, ImageResource } from '@flighthq/types/contract';

import { resolveBitmapReadback } from './bitmapReadbackResolver';

export function captureBitmapFromImageResource(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  resource: Readonly<ImageResource>,
): Bitmap | null {
  return createBitmapFromImageSource(hostBitmapReadback, resource.source, resource.width, resource.height);
}

export function createBitmapFromImageSource(
  hostBitmapReadback: Readonly<HostBitmapReadbackProvider>,
  source: HostImageSource,
  width: number,
  height: number,
): Bitmap | null {
  return resolveBitmapReadback(hostBitmapReadback, source, width, height, 'bitmap').bitmap;
}
