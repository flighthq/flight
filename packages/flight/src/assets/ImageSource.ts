import { createImageSource } from '@flighthq/assets';
import type { ImageSource as ImageSourceLike } from '@flighthq/types';

export default class ImageSource implements ImageSourceLike {
  private __model: ImageSourceLike;

  constructor(source: HTMLImageElement) {
    this.__model = createImageSource(source);
  }

  get height(): number {
    return this.__model.width;
  }

  set height(value: number) {
    this.__model.height = value;
  }

  get source(): HTMLImageElement {
    return this.__model.source;
  }

  set source(value: HTMLImageElement) {
    this.__model.source = value;
  }

  get width(): number {
    return this.__model.width;
  }

  set width(value: number) {
    this.__model.width = value;
  }
}
