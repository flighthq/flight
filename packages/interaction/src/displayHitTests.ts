import type { SceneNode } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';

export function defaultBitmapHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultHTMLViewHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // HTMLView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultInputTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultMovieClipHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRenderViewHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultRichTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultShapeHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultStageHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultVideoHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}
