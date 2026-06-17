import { enableRenderFeatures, getRenderNode2D } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectClipHooks,
  RenderNode2D,
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
  popMask(state: RenderState, data: RenderNode2D): void {
    const s = state as CanvasRenderState;
    while (s.currentMaskDepth > data.maskDepth) {
      popCanvasMask(s);
      s.currentMaskDepth--;
    }
  },
  popClipRectangle(state: RenderState, data: RenderNode2D): void {
    const s = state as CanvasRenderState;
    while (s.currentClipRectangleDepth > data.clipRectangleDepth) {
      popCanvasClipRectangle(s);
      s.currentClipRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getRenderNode2D(state, source.mask);
    if (maskData === undefined) return;
    pushCanvasMask(state as CanvasRenderState, maskData);
    state.currentMaskDepth++;
  },
  pushClipRectangle(state: RenderState, data: RenderNode2D, source: DisplayObject, hasChildren: boolean): void {
    if (!hasChildren || source.clipRectangle === null) return;
    pushCanvasClipRectangle(state as CanvasRenderState, source.clipRectangle, data.transform2D);
    state.currentClipRectangleDepth++;
  },
};
