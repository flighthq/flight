import { invalidateAppearance, invalidateLocalBounds } from '@flighthq/scene-graph-core';
import { createBitmap } from '@flighthq/scene-graph-display';
import type { Bitmap as BitmapType } from '@flighthq/types';

import type { ImageSource } from '../../../assets';
import { getImageSourceFromType, registerImageSource } from '../../../assets/internal/imageSourceMap';
import DisplayObject from './DisplayObject';
import type { DisplayObjectInternal } from './internal/writeInternal';

export default class Bitmap extends DisplayObject {
  declare public readonly value: BitmapType;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).value = createBitmap();
  }

  // Get & Set Methods

  get image(): ImageSource | null {
    return getImageSourceFromType(this.value.data.image);
  }

  set image(value: ImageSource | null) {
    if (value !== null) {
      if (this.value.data.image === value.value) return;
      this.value.data.image = value.value;
      registerImageSource(value);
    } else {
      if (this.value.data.image === null) return;
      this.value.data.image = null;
    }
    invalidateLocalBounds(this.value);
    invalidateAppearance(this.value);
  }

  get smoothing(): boolean {
    return this.value.data.smoothing;
  }

  set smoothing(value: boolean) {
    if (this.value.data.smoothing === value) return;
    this.value.data.smoothing = value;
    invalidateAppearance(this.value);
  }
}
