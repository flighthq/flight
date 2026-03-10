import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface DOMElementData extends DisplayObjectData {
  element: HTMLElement | null;
}

export interface DOMElement extends DisplayObject {
  data: DOMElementData;
}

export const DOMElementKind: unique symbol = Symbol('DOMElement');
