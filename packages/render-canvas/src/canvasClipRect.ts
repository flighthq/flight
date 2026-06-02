import type { CanvasRenderState, DisplayObjectRenderTreeNode, Matrix, Rectangle } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function popCanvasClipRectangle(state: CanvasRenderState): void {
  state.context.restore();
}

export function popCanvasScrollRectangle(state: CanvasRenderState): void {
  state.context.restore();
  state.currentScrollRectDepth--;
}

export function pushCanvasClipRectangle(state: CanvasRenderState, rect: Rectangle, transform: Matrix): void {
  state.context.save();

  setCanvasTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushCanvasScrollRectangle(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  pushCanvasClipRectangle(state, data.source.scrollRect!, data.transform2D);
  state.currentScrollRectDepth++;
}
