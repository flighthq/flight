import type { NodeAny } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultBitmapHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPoint(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultHTMLViewHitTestPoint(_source: NodeAny, _x: number, _y: number, _shapeFlag: boolean): boolean {
  // HTMLView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultInputTextHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultMovieClipHitTestPoint(_source: NodeAny, _x: number, _y: number, _shapeFlag: boolean): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRenderViewHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultRichTextHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultShapeHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultStageHitTestPoint(_source: NodeAny, _x: number, _y: number, _shapeFlag: boolean): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultVideoHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}
