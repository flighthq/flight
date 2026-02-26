import { matrix3x2 } from '@flighthq/math';
import type { RendererState } from '@flighthq/types';

export function createRendererState(obj?: Partial<RendererState>): RendererState {
  return {
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRGBA: obj?.backgroundColorRGBA ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentBlendMode: obj?.currentBlendMode ?? null,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderableStack: obj?.renderableStack ?? [],
    renderableDataMap: obj?.renderableDataMap ?? new WeakMap(),
    renderTransform: obj?.renderTransform ?? matrix3x2.create(),
    renderQueue: obj?.renderQueue ?? [],
    renderQueueLength: obj?.renderQueueLength ?? 0,
    roundPixels: obj?.roundPixels ?? false,
  };
}
