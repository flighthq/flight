import type { DOMObject, DOMObjectData, PartialWithData } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createDOMObject(obj: PartialWithData<DOMObject> = {}): DOMObject {
  if (obj.data === undefined) obj.data = {} as DOMObjectData;
  if (obj.data.element === undefined) obj.data.element = null;
  if (obj.type === undefined) obj.type = 'dom';
  return createDisplayObject(obj) as DOMObject;
}
