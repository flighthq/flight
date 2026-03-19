import type { DisplayObject as DisplayObjectModel } from '@flighthq/types';

import type DisplayObject from '../DisplayObject';

export function getDisplayObjectFromModel(
  model: Readonly<DisplayObjectModel> | null | undefined,
): DisplayObject | null {
  if (!model) return null;
  const object = objectsByModel.get(model);
  return object ?? null;
}

export function registerDisplayObject(object: DisplayObject): void {
  objectsByModel.set(object.model, object);
}

const objectsByModel: WeakMap<DisplayObjectModel, DisplayObject> = new WeakMap();
