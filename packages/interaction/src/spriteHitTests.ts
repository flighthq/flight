import type { NodeAny } from '@flighthq/types/contract';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultQuadBatchHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return defaultSpriteHitTestHandler(source, x, y);
}

export function defaultSpriteHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTilemapHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return defaultSpriteHitTestHandler(source, x, y);
}
