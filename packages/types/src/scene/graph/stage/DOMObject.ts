import type { DisplayObject, PrimitiveData } from './DisplayObject';

export interface DOMObjectData extends PrimitiveData {
  element: HTMLElement | null;
}

export interface DOMObject extends DisplayObject {
  data: DOMObjectData;
}
