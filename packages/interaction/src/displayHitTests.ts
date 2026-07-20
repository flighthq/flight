import type { NodeAny } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultBitmapHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestHandler(_source: NodeAny, _x: number, _y: number): boolean {
  return false;
}

export function defaultHtmlViewHitTestHandler(_source: NodeAny, _x: number, _y: number): boolean {
  // HtmlView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultMovieClipHitTestHandler(_source: NodeAny, _x: number, _y: number): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRenderViewHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultRichTextHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultShapeHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  // Coarse bounds box. Shape-accurate winding is opt-in via `registerShapeHitTest` so the
  // default registrar stays free of `@flighthq/shape` / `@flighthq/path`.
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTextHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTextInputHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultVideoHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}
