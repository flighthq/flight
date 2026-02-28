import type { DOMObject, DOMObjectData, PartialWithData } from '@flighthq/types';

import { createPrimitive } from './internal/createPrimitive';

export function createDOMObject(obj?: PartialWithData<DOMObject>): DOMObject {
  return createPrimitive<DOMObject, DOMObjectData>('dom', obj, createDOMObjectData);
}

export function createDOMObjectData(data?: Partial<DOMObjectData>): DOMObjectData {
  return {
    element: data?.element ?? null,
  };
}
