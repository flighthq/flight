import { createBitmap } from '@flighthq/stage';
import type { Bitmap as BitmapLike } from '@flighthq/types';

import DisplayObject from './DisplayObject';

export default class Bitmap extends DisplayObject implements BitmapLike {
  declare protected __data: BitmapLike;

  constructor() {
    super();
  }

  protected override __create(): void {
    this.__data = createBitmap();
  }
}
