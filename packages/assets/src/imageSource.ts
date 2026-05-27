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
