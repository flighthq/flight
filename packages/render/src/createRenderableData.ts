import { matrix3x2 } from '@flighthq/math';
import type { Renderable, RenderableData } from '@flighthq/types';

export function createRenderableData(source: Renderable): RenderableData {
  return {
    source: source,
    appearanceID: -1,
    cacheAsBitmap: false,
    localBoundsID: -1,
    mask: null,
    renderAlpha: -1,
    renderTransform: matrix3x2.create(),
    worldTransformID: -1,
  };
}
