import type { GraphNode, SpriteBatch } from '@flighthq/types';

import { hitTestLocalBoundsRect } from './hitTests';
import { defaultSpriteHitTestPoint } from './spriteHitTests';

export function defaultBitmapHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO: Return true if within bitmap bounds, if shapeFlag true, check if pixel is non-transparent
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
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
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO: Is there a way to propagate this check?
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultInputTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultMovieClipHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultRichTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultShapeHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO: Check actual shape geometry
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
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
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultTextHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultVideoHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}
