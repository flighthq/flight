import { BlendMode, type RendererState } from '@flighthq/types';

export function createRendererState(obj?: Partial<RendererState>): RendererState {
  return {
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRGBA: obj?.backgroundColorRGBA ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentFrameID: obj?.currentFrameID ?? 0,
    currentQueue: obj?.currentQueue ?? [],
    currentQueueLength: obj?.currentQueueLength ?? 0,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderableDataMap: obj?.renderableDataMap ?? new WeakMap(),
    renderAlpha: obj?.renderAlpha ?? 1,
    renderBlendMode: obj?.renderBlendMode ?? BlendMode.Normal,
    renderColorTransform: obj?.renderColorTransform ?? null,
    renderShader: obj?.renderShader ?? null,
    renderTransform: obj?.renderTransform ?? null,
    roundPixels: obj?.roundPixels ?? false,
    tempStack: obj?.tempStack ?? [],
  };
}
