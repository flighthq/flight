import { createEntity } from '@flighthq/entity';
import type { ImageSource } from '@flighthq/types';

export function createImageSource(image?: CanvasImageSource): ImageSource {
  const src = image ?? null;
  const width =
    src instanceof HTMLVideoElement
      ? src.videoWidth
      : ((src as HTMLImageElement | HTMLCanvasElement | null)?.width ?? 0);
  const height =
    src instanceof HTMLVideoElement
      ? src.videoHeight
      : ((src as HTMLImageElement | HTMLCanvasElement | null)?.height ?? 0);
  return createEntity({ height, src, version: 0, width });
}

// Bumps the asset content revision so consumers (renderer texture caches) know the pixels behind
// this image changed even though the object identity is the same. Call after mutating the backing
// pixels in place; the Surface API calls it for you. Asset-tier analog of invalidateNodeLocalContent.
export function invalidateImageSource(source: ImageSource): void {
  source.version = (source.version + 1) >>> 0;
}
