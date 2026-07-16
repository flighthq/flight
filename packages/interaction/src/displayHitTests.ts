import type { NodeAny } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultBitmapHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultHtmlViewHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // HtmlView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultMovieClipHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRenderViewHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultRichTextHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultShapeHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  // Coarse bounds box. Shape-accurate winding is opt-in via `registerAccurateShapeHitTest` so the
  // default registrar stays free of `@flighthq/shape` / `@flighthq/path`.
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultStageHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTextInputHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultVideoHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}
