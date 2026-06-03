import { enableRenderFeatures } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectRenderNode,
  Matrix,
  RectangleLike,
  ScrollRectangleHooks,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

const canvasScrollRectangleHooks: ScrollRectangleHooks = {
  pop: (state) => popCanvasClipRectangle(state as CanvasRenderState),
  push: (state, data) =>
    pushCanvasClipRectangle(
      state as CanvasRenderState,
      (data.source as DisplayObject).scrollRectangle!,
      data.transform2D,
    ),
};

export function enableCanvasScrollRectangleSupport(state: CanvasRenderState): void {
  state.scrollRectangleHooks = canvasScrollRectangleHooks;
  enableRenderFeatures(state, RenderFeatures.ScrollRectangle);
}

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
