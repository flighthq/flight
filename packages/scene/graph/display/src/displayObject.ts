import { type DisplayObject, DisplayObjectType, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createDisplayObject(obj?: PartialWithData<DisplayObject>): DisplayObject {
  return createPrimitive(DisplayObjectType.DisplayObject, obj);
}
