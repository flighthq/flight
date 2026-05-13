import { createEntity } from '@flighthq/foundation';
import type { ImageSource } from '@flighthq/types';

export function createImageSource(image?: HTMLImageElement): ImageSource {
  return createEntity({
    height: image?.height ?? 0,
    src: image ?? null,
    width: image?.width ?? 0,
  });
}
