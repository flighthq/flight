import type { ImageSource } from '@flighthq/types';

export function createImageSource(image: HTMLImageElement): ImageSource {
  return {
    height: image.height,
    source: image,
    width: image.width,
  };
}
