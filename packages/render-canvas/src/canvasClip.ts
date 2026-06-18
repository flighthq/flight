import { enableRenderFeatures, getRenderProxy2D } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectClipHooks,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { popCanvasClipRectangle, pushCanvasClipRectangle } from './canvasClipRectangle';
import { popCanvasMask, pushCanvasMask } from './canvasMask';

export function enableCanvasClipRectangleSupport(state: CanvasRenderState): void {
  state.displayObjectClipHooks = canvasClipHooks;
  enableRenderFeatures(state, RenderFeatures.ClipRectangle);
}

export function enableCanvasMaskSupport(state: CanvasRenderState): void {
  state.displayObjectClipHooks = canvasClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
}

const canvasClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as CanvasRenderState;
    while (s.currentMaskDepth > 0) {
      popCanvasMask(s);
      s.currentMaskDepth--;
    }
    while (s.currentClipRectangleDepth > 0) {
      popCanvasClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  popMask(state: RenderState, data: RenderProxy2D): void {
    const s = state as CanvasRenderState;
    while (s.currentMaskDepth > data.maskDepth) {
      popCanvasMask(s);
      s.currentMaskDepth--;
    }
  },
  popClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    const s = state as CanvasRenderState;
    const clipTarget = data.clipRectangleDepth - (source.clipRectangle != null ? 1 : 0);
    while (s.currentClipRectangleDepth > clipTarget) {
      popCanvasClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderProxy2D(state, source.mask);
    if (maskData === undefined) return;
    pushCanvasMask(state as CanvasRenderState, maskData);
    state.currentMaskDepth++;
  },
  pushClipRectangle(state: RenderState, data: RenderProxy2D, source: DisplayObject): void {
    if (source.clipRectangle === null) return;
    pushCanvasClipRectangle(state as CanvasRenderState, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
