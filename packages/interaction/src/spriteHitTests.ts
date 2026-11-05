import type { NodeAny } from '@flighthq/node/contract';

import { hitTestGraphLocalBounds } from './hitTests.ts';

export function defaultQuadBatchHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return defaultSpriteHitTestHandler(source, x, y);
}

export function defaultSpriteHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTilemapHitTestHandler(source: NodeAny, x: number, y: number): boolean {
  return defaultSpriteHitTestHandler(source, x, y);
}
