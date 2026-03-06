import { BlendMode, type RendererState } from '@flighthq/types';

export function createRendererState(obj?: Partial<RendererState>): RendererState {
  return {
    allowCacheAsBitmap: obj?.allowCacheAsBitmap ?? true,
    allowFilters: obj?.allowFilters ?? true,
    allowSmoothing: obj?.allowSmoothing ?? true,
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRGBA: obj?.backgroundColorRGBA ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentFrameID: obj?.currentFrameID ?? 0,
    currentMaskDepth: obj?.currentMaskDepth ?? 0,
    currentQueue: obj?.currentQueue ?? [],
    currentQueueLength: obj?.currentQueueLength ?? 0,
    currentScrollRectDepth: obj?.currentScrollRectDepth ?? 0,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderNodeMap: obj?.renderNodeMap ?? new WeakMap(),
    renderAlpha: obj?.renderAlpha ?? 1,
    renderBlendMode: obj?.renderBlendMode ?? BlendMode.Normal,
    renderColorTransform: obj?.renderColorTransform ?? null,
    renderShader: obj?.renderShader ?? null,
    renderTransform: obj?.renderTransform ?? null,
    rendererMap: obj?.rendererMap ?? new Map(),
    rendererMapID: obj?.rendererMapID ?? 0,
    roundPixels: obj?.roundPixels ?? false,
    tempStack: obj?.tempStack ?? [],
  };
}
