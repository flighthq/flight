import type { CanvasRenderState, RenderNode } from '@flighthq/types';

import { setTransform } from './transform';

export function applyMask(state: CanvasRenderState, data: RenderNode): void {
  if (data.renderer !== null) data.renderer.applyMask(state, data);
}

export function popMask(state: CanvasRenderState): void {
  state.context.restore();
  // state.currentMaskDepth--;
}

export function pushMask(state: CanvasRenderState, data: RenderNode): void {
  state.context.save();

  setTransform(state, state.context, data.transform);

  state.context.beginPath();
  applyMask(state, data);
  state.context.closePath();

  state.context.clip();
}
