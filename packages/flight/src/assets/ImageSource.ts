import { createImageSource } from '@flighthq/assets';
import type { ImageSource as ImageSourceType } from '@flighthq/types';

export default class ImageSource {
  public readonly value: ImageSourceType;

  constructor(source: HTMLImageElement) {
    this.value = createImageSource(source);
  }

  static fromType(value: Readonly<ImageSourceType>): ImageSource {
    const out = new ImageSource(value.src);
    out.value.height = value.height;
    out.value.width = value.width;
    return out;
  }

  get height(): number {
    return this.value.width;
  }

  set height(value: number) {
    this.value.height = value;
  }

  get src(): HTMLImageElement {
    return this.value.src;
  }

  set src(value: HTMLImageElement) {
    this.value.src = value;
  }

  get width(): number {
    return this.value.width;
  }

  set width(value: number) {
    this.value.width = value;
  }
}
