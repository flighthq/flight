import { DisplayObjectType, type DOMObject, type DOMObjectData, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createDOMObject(obj?: PartialWithData<DOMObject>): DOMObject {
  return createPrimitive(DisplayObjectType.DOMObject, obj, createDOMObjectData) as DOMObject;
}

export function createDOMObjectData(data?: Partial<DOMObjectData>): DOMObjectData {
  return {
    element: data?.element ?? null,
  };
}
