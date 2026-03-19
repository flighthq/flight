import type { ImageSource as ImageSourceModel } from '@flighthq/types';

import type ImageSource from '../ImageSource';

export function getImageSourceFromModel(model: Readonly<ImageSourceModel> | null | undefined): ImageSource | null {
  if (!model) return null;
  const object = objectsByModel.get(model);
  return object ?? null;
}

export function registerImageSource(object: ImageSource): void {
  objectsByModel.set(object.model, object);
}

const objectsByModel: WeakMap<ImageSourceModel, ImageSource> = new WeakMap();
