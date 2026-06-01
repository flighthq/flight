import type { GraphNode } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';

export function defaultQuadBatchHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}

export function defaultSpriteHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultTilemapHitTestPoint(
  source: GraphNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}
