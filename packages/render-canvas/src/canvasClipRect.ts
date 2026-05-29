import type { CanvasRenderState, DisplayObjectRenderNode, Matrix, Rectangle } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function popCanvasClipRect(state: CanvasRenderState): void {
  state.context.restore();
}

export function popCanvasScrollRect(state: CanvasRenderState): void {
  state.context.restore();
  state.currentScrollRectDepth--;
}

export function pushCanvasClipRect(state: CanvasRenderState, rect: Rectangle, transform: Matrix): void {
  state.context.save();

  setCanvasTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushCanvasScrollRect(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  pushCanvasClipRect(state, data.source.scrollRect!, data.transform2D);
  state.currentScrollRectDepth++;
}
