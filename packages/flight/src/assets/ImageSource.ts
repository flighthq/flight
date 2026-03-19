import { createImageSource } from '@flighthq/assets';
import type { ImageSource as ImageSourceModel } from '@flighthq/types';

export default class ImageSource {
  protected _model: ImageSourceModel;

  constructor(source: HTMLImageElement) {
    this._model = createImageSource(source);
  }

  static fromModel(model: Readonly<ImageSourceModel>): ImageSource {
    const out = new ImageSource(model.src);
    out._model.height = model.height;
    out._model.width = model.width;
    return out;
  }

  get height(): number {
    return this._model.width;
  }

  set height(value: number) {
    this._model.height = value;
  }

  get model(): ImageSourceModel {
    return this._model;
  }

  get src(): HTMLImageElement {
    return this._model.src;
  }

  set src(value: HTMLImageElement) {
    this._model.src = value;
  }

  get width(): number {
    return this._model.width;
  }

  set width(value: number) {
    this._model.width = value;
  }
}
