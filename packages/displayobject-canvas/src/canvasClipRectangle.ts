import type { CanvasRenderState, Matrix, PathWinding, RectangleLike } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

export function popCanvasClipRectangle(state: CanvasRenderState): void {
  state.context.restore();
}

// Clips the context to arbitrary flattened contours (a path clip) under the given transform, using the
// native canvas clip — crisp at any zoom, no resolution-bound texture. Paired with popCanvasClipRectangle
// (a context save/restore bracket, like the rectangle clip). Empty contours leave the context unclipped.
export function pushCanvasClipContours(
  state: CanvasRenderState,
  contours: readonly (readonly number[])[],
  winding: PathWinding,
  transform: Matrix,
): void {
  state.context.save();

  setCanvasTransform(state, state.context, transform);

  state.context.beginPath();
  for (let c = 0; c < contours.length; c++) {
    const contour = contours[c];
    if (contour.length < 2) continue;
    state.context.moveTo(contour[0], contour[1]);
    for (let i = 2; i < contour.length; i += 2) {
      state.context.lineTo(contour[i], contour[i + 1]);
    }
    state.context.closePath();
  }
  state.context.clip(winding === 'evenOdd' ? 'evenodd' : 'nonzero');
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
