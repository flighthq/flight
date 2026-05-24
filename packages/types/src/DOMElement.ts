import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

export interface DOMElementData extends DisplayObjectData {
  element: HTMLElement | null;
}

export interface DOMElementRuntime extends DisplayObjectRuntime {}

export interface DOMElement extends DisplayObject {
  data: DOMElementData;
}

export const DOMElementKind: unique symbol = Symbol('DOMElement');
