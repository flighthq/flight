import type { CanvasRenderState, DisplayObjectRenderNode, Matrix3x2, Rectangle } from '@flighthq/types';

import { setTransform } from './canvasTransform';

export function popClipRect(state: CanvasRenderState): void {
  state.context.restore();
}

export function popScrollRect(state: CanvasRenderState): void {
  state.context.restore();
  state.currentScrollRectDepth--;
}

export function pushClipRect(state: CanvasRenderState, rect: Rectangle, transform: Matrix3x2): void {
  state.context.save();

  setTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushScrollRect(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  pushClipRect(state, data.source.scrollRect!, data.transform);
  state.currentScrollRectDepth++;
}
