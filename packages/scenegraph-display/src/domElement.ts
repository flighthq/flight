import type { DOMElement, DOMElementData, DOMElementRuntime, PartialNode } from '@flighthq/types';
import { DOMElementKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function createDOMElement(obj?: Readonly<PartialNode<DOMElement>>): DOMElement {
  return createDisplayObjectGeneric(DOMElementKind, obj, createDOMElementData, createDOMElementRuntime) as DOMElement;
}

export function createDOMElementData(data?: Readonly<Partial<DOMElementData>>): DOMElementData {
  return {
    element: data?.element ?? null,
  };
}

export function createDOMElementRuntime(): DOMElementRuntime {
  return createDisplayObjectRuntime() as DOMElementRuntime;
}

export function getDOMElementRuntime(source: Readonly<DOMElement>): Readonly<DOMElementRuntime> {
  return getDisplayObjectRuntime(source) as DOMElementRuntime;
}
