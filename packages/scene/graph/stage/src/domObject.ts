import { type DOMObject, type DOMObjectData, DOMObjectKind, type PartialWithData } from '@flighthq/types';

import { createPrimitive } from './primitive';

export function createDOMObject(obj?: PartialWithData<DOMObject>): DOMObject {
  return createPrimitive<DOMObject, DOMObjectData>(DOMObjectKind, obj, createDOMObjectData);
}

export function createDOMObjectData(data?: Partial<DOMObjectData>): DOMObjectData {
  return {
    element: data?.element ?? null,
  };
}
