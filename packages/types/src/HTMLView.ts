import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

export interface HtmlViewData extends DisplayObjectData {
  element: HTMLElement | null;
  height: number;
  width: number;
}

export interface HtmlViewRuntime extends DisplayObjectRuntime {}

export interface HtmlView extends DisplayObject {
  data: HtmlViewData;
}

export const HtmlViewKind: unique symbol = Symbol('HtmlView');
