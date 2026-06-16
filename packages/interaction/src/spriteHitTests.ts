import type { NodeAny } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultQuadBatchHitTestPoint(source: NodeAny, x: number, y: number, shapeFlag: boolean): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}

export function defaultSpriteHitTestPoint(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTilemapHitTestPoint(source: NodeAny, x: number, y: number, shapeFlag: boolean): boolean {
  // TODO
  return defaultSpriteHitTestPoint(source, x, y, shapeFlag);
}
