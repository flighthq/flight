import type { DisplayObject, DisplayObjectData, PartialWithData } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createDisplayObject(obj?: PartialWithData<DisplayObject>): DisplayObject {
  return createPrimitive<DisplayObject, DisplayObjectData>(DisplayObjectKind, obj);
}
