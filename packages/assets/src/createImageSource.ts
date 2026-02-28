import type { ImageSource } from '@flighthq/types';

export function createImageSource(image: HTMLImageElement): ImageSource {
  return {
    height: image.height,
    src: image,
    width: image.width,
  };
}
