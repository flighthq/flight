import { invalidateAppearance, invalidateLocalBounds } from '@flighthq/scene-graph-core';
import { createBitmap } from '@flighthq/scene-graph-display';
import type { Bitmap as BitmapModel } from '@flighthq/types';

import type { ImageSource } from '../../../assets';
import { getImageSourceFromModel, registerImageSource } from '../../../assets/internal/imageSourceMap';
import DisplayObject from './DisplayObject';

export default class Bitmap extends DisplayObject {
  declare protected _model: BitmapModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    this._model = createBitmap();
  }

  // Get & Set Methods

  get image(): ImageSource | null {
    return getImageSourceFromModel(this._model.data.image);
  }

  set image(value: ImageSource | null) {
    if (value !== null) {
      if (this._model.data.image === value.model) return;
      this._model.data.image = value.model;
      registerImageSource(value);
    } else {
      if (this._model.data.image === null) return;
      this._model.data.image = null;
    }
    invalidateLocalBounds(this._model);
    invalidateAppearance(this._model);
  }

  override get model(): BitmapModel {
    return this._model;
  }

  get smoothing(): boolean {
    return this._model.data.smoothing;
  }

  set smoothing(value: boolean) {
    if (this._model.data.smoothing === value) return;
    this._model.data.smoothing = value;
    invalidateAppearance(this._model);
  }
}
