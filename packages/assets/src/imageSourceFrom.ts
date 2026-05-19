import { createEntity } from '@flighthq/foundation';
import type { ImageSource } from '@flighthq/types';

export function imageSourceFromCanvas(canvas: HTMLCanvasElement): ImageSource {
  return createEntity({
    height: canvas.height,
    src: canvas,
    width: canvas.width,
  });
}

export function imageSourceFromImageBitmap(bitmap: ImageBitmap): ImageSource {
  return createEntity({
    height: bitmap.height,
    src: bitmap,
    width: bitmap.width,
  });
}

export function imageSourceFromImageElement(img: HTMLImageElement): ImageSource {
  return createEntity({
    height: img.height,
    src: img,
    width: img.width,
  });
}
