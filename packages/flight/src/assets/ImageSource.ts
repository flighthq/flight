import { createImageSource } from '@flighthq/assets';
import type { ImageSource as ImageSourceModel } from '@flighthq/types';

export default class ImageSource {
  public readonly model: ImageSourceModel;

  constructor(source: HTMLImageElement) {
    this.model = createImageSource(source);
  }

  static fromModel(model: Readonly<ImageSourceModel>): ImageSource {
    const out = new ImageSource(model.src);
    out.model.height = model.height;
    out.model.width = model.width;
    return out;
  }

  get height(): number {
    return this.model.width;
  }

  set height(value: number) {
    this.model.height = value;
  }

  get src(): HTMLImageElement {
    return this.model.src;
  }

  set src(value: HTMLImageElement) {
    this.model.src = value;
  }

  get width(): number {
    return this.model.width;
  }

  set width(value: number) {
    this.model.width = value;
  }
}
