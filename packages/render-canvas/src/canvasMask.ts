import { setDisplayObjectMaskHooks } from '@flighthq/render';
import type { CanvasRenderState, DisplayObjectMaskHooks, DisplayObjectRenderTreeNode } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function applyCanvasMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);
}

export function popCanvasMask(state: CanvasRenderState, _data: DisplayObjectRenderTreeNode): void {
  state.context.restore();
  // state.currentMaskDepth--;
}

export function pushCanvasMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  state.context.save();

  setCanvasTransform(state, state.context, data.transform2D);

  state.context.beginPath();
  applyCanvasMask(state, data);
  state.context.closePath();

  state.context.clip();
}

export function registerCanvasMaskSupport(state: CanvasRenderState): void {
  setDisplayObjectMaskHooks(state, canvasMaskHooks);
}

const canvasMaskHooks: DisplayObjectMaskHooks = {
  popMask: popCanvasMask,
  pushMask: pushCanvasMask,
};
