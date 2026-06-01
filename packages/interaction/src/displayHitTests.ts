import type { GraphNode, SpriteBatch } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';
import { defaultSpriteHitTestPoint } from './spriteHitTests';

export function defaultBitmapHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPoint(
  _source: GraphNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultDOMElementHitTestPoint(
  _source: GraphNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // DOM elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultInputTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultMovieClipHitTestPoint(
  _source: GraphNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRichTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultShapeHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultSpriteBatchHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  const spriteBatch = source as SpriteBatch;
  if (spriteBatch.data.graph !== null) {
    return defaultSpriteHitTestPoint(spriteBatch.data.graph, x, y, shapeFlag);
  }
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultStageHitTestPoint(
  _source: GraphNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultVideoHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}
