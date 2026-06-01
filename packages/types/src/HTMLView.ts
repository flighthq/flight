import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

export interface HTMLViewData extends DisplayObjectData {
  element: HTMLElement | null;
  height: number;
  width: number;
}

export interface HTMLViewRuntime extends DisplayObjectRuntime {}

export interface HTMLView extends DisplayObject {
  data: HTMLViewData;
}

export const HTMLViewKind: unique symbol = Symbol('HTMLView');
