import { createEntity } from '@flighthq/entity';
import { BlendMode, RenderFeatures, type RenderState } from '@flighthq/types';

export function createRenderState(obj?: Partial<RenderState>): RenderState {
  return createEntity({
    allowSmoothing: obj?.allowSmoothing ?? true,
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRGBA: obj?.backgroundColorRGBA ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentFrameID: obj?.currentFrameID ?? 0,
    currentMaskDepth: obj?.currentMaskDepth ?? 0,
    currentClipRectangleDepth: obj?.currentClipRectangleDepth ?? 0,
    displayObjectClipHooks: obj?.displayObjectClipHooks ?? null,
    displayObjectMaskRendererMap: obj?.displayObjectMaskRendererMap ?? new Map(),
    displayObjectMaskRendererMapID: obj?.displayObjectMaskRendererMapID ?? 0,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderProxyAdapterMap: obj?.renderProxyAdapterMap ?? new WeakMap(),
    renderProxyMap: obj?.renderProxyMap ?? new WeakMap(),
    renderAlpha: obj?.renderAlpha ?? 1,
    renderBlendMode: obj?.renderBlendMode ?? BlendMode.Normal,
    renderColorTransform: obj?.renderColorTransform ?? null,
    renderFeatures: obj?.renderFeatures ?? RenderFeatures.None,
    renderTransform2D: obj?.renderTransform2D ?? null,
    rendererMap: obj?.rendererMap ?? new Map(),
    rendererMapID: obj?.rendererMapID ?? 0,
    roundPixels: obj?.roundPixels ?? false,
    sceneGraphSyncPolicy: obj?.sceneGraphSyncPolicy ?? 'refreshDerivedState',
    tempStack: obj?.tempStack ?? [],
  });
}
