import type { DOMObject, DOMObjectData, PartialWithData } from '@flighthq/types';
import { DOMObjectKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createDOMObject(obj?: Readonly<PartialWithData<DOMObject>>): DOMObject {
  return createDisplayObjectGeneric(DOMObjectKind, obj, createDOMObjectData) as DOMObject;
}

export function createDOMObjectData(data?: Readonly<Partial<DOMObjectData>>): DOMObjectData {
  return {
    element: data?.element ?? null,
  };
}
