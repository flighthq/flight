import type { DOMElement, DOMElementData, PartialWithData } from '@flighthq/types';
import { DOMElementKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createDOMElement(obj?: Readonly<PartialWithData<DOMElement>>): DOMElement {
  return createDisplayObjectGeneric(DOMElementKind, obj, createDOMElementData) as DOMElement;
}

export function createDOMElementData(data?: Readonly<Partial<DOMElementData>>): DOMElementData {
  return {
    element: data?.element ?? null,
  };
}
