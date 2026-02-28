import { createBitmap, invalidateAppearance, invalidateLocalBounds } from '@flighthq/scene-graph-stage';
import type { Bitmap as BitmapModel } from '@flighthq/types';

import type { ImageSource } from '../../../assets';
import { getImageSourceFromModel } from '../../../assets/internal/imageSourceMap';
import DisplayObject from './DisplayObject';
import type { DisplayObjectInternal } from './internal/writeInternal';

export default class Bitmap extends DisplayObject {
  declare public readonly model: BitmapModel;

  constructor() {
    super();
  }

  protected override __create(): void {
    (this as DisplayObjectInternal).model = createBitmap();
  }

  // Get & Set Methods

  get image(): ImageSource | null {
    return getImageSourceFromModel(this.model.data.image);
  }

  set image(value: ImageSource | null) {
    if (value !== null) {
      if (this.model.data.image === value.model) return;
      this.model.data.image = value.model;
    } else {
      if (this.model.data.image === null) return;
      this.model.data.image = null;
    }
    invalidateLocalBounds(this.model);
    invalidateAppearance(this.model);
  }

  get smoothing(): boolean {
    return this.model.data.smoothing;
  }

  set smoothing(value: boolean) {
    if (this.model.data.smoothing === value) return;
    this.model.data.smoothing = value;
    invalidateAppearance(this.model);
  }
}
