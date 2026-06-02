import type { CanvasRenderState, DisplayObjectRenderer, DisplayObjectRenderTreeNode } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function applyCanvasMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  if (data.renderer !== null) (data.renderer as DisplayObjectRenderer).drawMask(state, data);
}

export function popCanvasMask(state: CanvasRenderState): void {
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
