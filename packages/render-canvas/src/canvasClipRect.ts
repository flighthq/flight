import type { CanvasRenderState, DisplayObject, DisplayObjectRenderNode, Matrix, RectangleLike } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function popCanvasClipRectangle(state: CanvasRenderState): void {
  state.context.restore();
}

export function popCanvasScrollRectangle(state: CanvasRenderState): void {
  state.context.restore();
  state.currentScrollRectangleDepth--;
}

export function pushCanvasClipRectangle(
  state: CanvasRenderState,
  rect: Readonly<RectangleLike>,
  transform: Matrix,
): void {
  state.context.save();

  setCanvasTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushCanvasScrollRectangle(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  pushCanvasClipRectangle(state, (data.source as DisplayObject).scrollRectangle!, data.transform2D);
  state.currentScrollRectangleDepth++;
}
