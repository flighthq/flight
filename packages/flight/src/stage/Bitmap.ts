import { createBitmap } from '@flighthq/stage';
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
}
