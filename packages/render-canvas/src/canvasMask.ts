import type { CanvasRenderState, RenderNode2D } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function drawCanvasMask(state: CanvasRenderState, data: RenderNode2D): void {
  state.displayObjectMaskRendererMap.get(data.source.kind)?.drawMask(state, data);
}

export function popCanvasMask(state: CanvasRenderState): void {
  state.context.restore();
}

export function pushCanvasMask(state: CanvasRenderState, data: RenderNode2D): void {
  state.context.save();

  setCanvasTransform(state, state.context, data.transform2D);

  state.context.beginPath();
  drawCanvasMask(state, data);
  state.context.closePath();

  state.context.clip();
}
