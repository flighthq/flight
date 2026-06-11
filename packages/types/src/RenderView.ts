import type { DisplayObject, DisplayObjectData, DisplayObjectRuntime } from './DisplayObject';

export interface RenderViewRenderer {
  readonly canvas: HTMLCanvasElement;
  render(): void;
}

export interface RenderViewData extends DisplayObjectData {
  height: number;
  renderer: RenderViewRenderer | null;
  width: number;
}

export interface RenderViewRuntime extends DisplayObjectRuntime {}

export interface RenderView extends DisplayObject {
  data: RenderViewData;
}

export const RenderViewKind: unique symbol = Symbol('RenderView');
