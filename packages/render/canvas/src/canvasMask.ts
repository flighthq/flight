import type { CanvasRenderState, DisplayObjectRenderNode } from '@flighthq/types';

import { setTransform } from './canvasTransform';

export function applyMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  if (data.renderer !== null) data.renderer.drawMask(state, data);
}

export function popMask(state: CanvasRenderState): void {
  state.context.restore();
  // state.currentMaskDepth--;
}

export function pushMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  state.context.save();

  setTransform(state, state.context, data.transform2D);

  state.context.beginPath();
  applyMask(state, data);
  state.context.closePath();

  state.context.clip();
}
