import type { NodeAny } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultQuadBatchHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  return defaultSpriteHitTestPointHandler(source, x, y, shapeFlag);
}

export function defaultSpriteHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTilemapHitTestPointHandler(source: NodeAny, x: number, y: number, shapeFlag: boolean): boolean {
  return defaultSpriteHitTestPointHandler(source, x, y, shapeFlag);
}
