import type { ImageSource as ImageSourceType } from '@flighthq/types';

import type ImageSource from '../ImageSource';

export function getImageSourceFromType(value: Readonly<ImageSourceType> | null | undefined): ImageSource | null {
  if (!value) return null;
  const object = objectsByType.get(value);
  return object ?? null;
}

export function registerImageSource(object: ImageSource): void {
  objectsByType.set(object.value, object);
}

const objectsByType: WeakMap<ImageSourceType, ImageSource> = new WeakMap();
