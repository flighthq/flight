import type { DisplayObject, DisplayObjectData } from './DisplayObject';

export interface DOMObjectData extends DisplayObjectData {
  element: HTMLElement | null;
}

export interface DOMObject extends DisplayObject {
  data: DOMObjectData;
}

export const DOMObjectKind: unique symbol = Symbol('Bitmap');
