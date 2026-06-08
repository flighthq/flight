import type { CanvasRenderState, Matrix, RectangleLike } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function popCanvasClipRectangle(state: CanvasRenderState): void {
  state.context.restore();
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
