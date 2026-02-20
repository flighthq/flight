import { createBitmap, invalidateAppearance, invalidateLocalBounds } from '@flighthq/stage';
import type { Bitmap as BitmapLike, BitmapData } from '@flighthq/types';

import DisplayObject from './DisplayObject';

export default class Bitmap extends DisplayObject implements BitmapLike {
  declare protected __model: BitmapLike;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.__model = createBitmap();
  }

  // Get & Set Methods

  override get data(): BitmapData {
    return this.__model.data;
  }

  override set data(value: BitmapData) {
    this.__model.data = value;
  }

  get image(): HTMLImageElement | null {
    return this.__model.data.image;
  }

  set image(value: HTMLImageElement | null) {
    this.__model.data.image = value;
    invalidateLocalBounds(this.__model);
    invalidateAppearance(this.__model);
  }

  get smoothing(): boolean {
    return this.__model.data.smoothing;
  }

  set smoothing(value: boolean) {
    this.__model.data.smoothing = true;
    invalidateAppearance(this.__model);
  }
}
