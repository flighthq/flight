import type { Node2D, Node2DData, Node2DRuntime } from './Node2D';

export interface HtmlViewData extends Node2DData {
  element: HTMLElement | null;
  height: number;
  width: number;
}

export interface HtmlViewRuntime extends Node2DRuntime {}

export interface HtmlView extends Node2D {
  data: HtmlViewData;
}

export const HtmlViewKind = 'HtmlView';
