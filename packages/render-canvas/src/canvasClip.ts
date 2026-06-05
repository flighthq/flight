import { enableRenderFeatures, getDisplayObjectRenderNode } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectClipHooks,
  DisplayObjectRenderNode,
  RenderState,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { popCanvasClipRectangle, pushCanvasClipRectangle } from './canvasClipRect';
import { popCanvasMask, pushCanvasMask } from './canvasMask';

export function enableCanvasMaskSupport(state: CanvasRenderState): void {
  state.displayObjectClipHooks = canvasClipHooks;
  enableRenderFeatures(state, RenderFeatures.Masks);
}

export function enableCanvasScrollRectangleSupport(state: CanvasRenderState): void {
  state.displayObjectClipHooks = canvasClipHooks;
  enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
}

const canvasClipHooks: DisplayObjectClipHooks = {
  finalize(state: RenderState): void {
    const s = state as CanvasRenderState;
    while (s.currentMaskDepth > 0) {
      popCanvasMask(s);
      s.currentMaskDepth--;
    }
    while (s.currentScrollRectangleDepth > 0) {
      popCanvasClipRectangle(s);
      s.currentScrollRectangleDepth--;
    }
  },
  popMask(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as CanvasRenderState;
    while (s.currentMaskDepth > data.maskDepth) {
      popCanvasMask(s);
      s.currentMaskDepth--;
    }
  },
  popScrollRectangle(state: RenderState, data: DisplayObjectRenderNode): void {
    const s = state as CanvasRenderState;
    while (s.currentScrollRectangleDepth > data.scrollRectangleDepth) {
      popCanvasClipRectangle(s);
      s.currentScrollRectangleDepth--;
    }
  },
  pushMask(state: RenderState, source: DisplayObject): void {
    if (source.mask === null) return;
    const maskData = getDisplayObjectRenderNode(state, source.mask);
    if (maskData === undefined) return;
    pushCanvasMask(state as CanvasRenderState, maskData);
    state.currentMaskDepth++;
  },
  pushScrollRectangle(
    state: RenderState,
    data: DisplayObjectRenderNode,
    source: DisplayObject,
    hasChildren: boolean,
  ): void {
    if (!hasChildren || source.scrollRectangle === null) return;
    pushCanvasClipRectangle(state as CanvasRenderState, source.scrollRectangle, data.transform2D);
    state.currentScrollRectangleDepth++;
  },
};
