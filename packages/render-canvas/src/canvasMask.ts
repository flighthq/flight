import { setDisplayObjectMaskHooks } from '@flighthq/render';
import type { CanvasRenderState, DisplayObjectMaskHooks, DisplayObjectRenderTreeNode } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function drawCanvasMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);
}

export function enableCanvasMaskSupport(state: CanvasRenderState): void {
  setDisplayObjectMaskHooks(state, canvasMaskHooks);
}

export function popCanvasMask(state: CanvasRenderState, _data: DisplayObjectRenderTreeNode): void {
  state.context.restore();
  // state.currentMaskDepth--;
}

export function pushCanvasMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  state.context.save();

  setCanvasTransform(state, state.context, data.transform2D);

  state.context.beginPath();
  drawCanvasMask(state, data);
  state.context.closePath();

  state.context.clip();
}

const canvasMaskHooks: DisplayObjectMaskHooks = {
  popMask: popCanvasMask,
  pushMask: pushCanvasMask,
};
