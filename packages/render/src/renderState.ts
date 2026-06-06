import { createEntity } from '@flighthq/entity';
import { BlendMode, RenderFeatures, type RenderState } from '@flighthq/types';

export function createRenderState(obj?: Partial<RenderState>): RenderState {
  return createEntity({
    allowSmoothing: obj?.allowSmoothing ?? true,
    appearanceHooks: obj?.appearanceHooks ?? null,
    backgroundColor: obj?.backgroundColor ?? 0,
    backgroundColorRGBA: obj?.backgroundColorRGBA ?? [],
    backgroundColorString: obj?.backgroundColorString ?? '',
    currentFrameID: obj?.currentFrameID ?? 0,
    currentMaskDepth: obj?.currentMaskDepth ?? 0,
    currentScrollRectangleDepth: obj?.currentScrollRectangleDepth ?? 0,
    displayObjectClipHooks: obj?.displayObjectClipHooks ?? null,
    displayObjectMaskRendererMap: obj?.displayObjectMaskRendererMap ?? new Map(),
    displayObjectMaskRendererMapID: obj?.displayObjectMaskRendererMapID ?? 0,
    pixelRatio: obj?.pixelRatio ?? 1,
    renderNodeMap: obj?.renderNodeMap ?? new WeakMap(),
    renderAlpha: obj?.renderAlpha ?? 1,
    renderBlendMode: obj?.renderBlendMode ?? BlendMode.Normal,
    renderColorTransform: obj?.renderColorTransform ?? null,
    renderFeatures: obj?.renderFeatures ?? RenderFeatures.None,
    renderShader: obj?.renderShader ?? null,
    renderTransform2D: obj?.renderTransform2D ?? null,
    rendererMap: obj?.rendererMap ?? new Map(),
    rendererMapID: obj?.rendererMapID ?? 0,
    roundPixels: obj?.roundPixels ?? false,
    tempStack: obj?.tempStack ?? [],
  });
}
