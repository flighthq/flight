import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';

export interface RenderViewRenderer {
  readonly canvas: HTMLCanvasElement;
  render(): void;
}

export interface RenderViewData extends Node2DData {
  height: number;
  renderer: RenderViewRenderer | null;
  width: number;
}

export interface RenderViewRuntime extends Node2DRuntime {}

export interface RenderView extends Node2D {
  data: RenderViewData;
}

export const RenderViewKind = 'RenderView';
