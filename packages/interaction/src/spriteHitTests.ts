import type { Node } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';

export function defaultQuadBatchHitTestPoint(
  source: Node<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}

export function defaultSpriteHitTestPoint(
  source: Node<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultTilemapHitTestPoint(
  source: Node<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}
