import type { DisplayObject as DisplayObjectType } from '@flighthq/types';

import type DisplayObject from '../DisplayObject';

export function getDisplayObjectFromType(value: Readonly<DisplayObjectType> | null | undefined): DisplayObject | null {
  if (!value) return null;
  const object = objectsByType.get(value);
  return object ?? null;
}

export function registerDisplayObject(object: DisplayObject): void {
  objectsByType.set(object.value, object);
}

const objectsByType: WeakMap<DisplayObjectType, DisplayObject> = new WeakMap();
