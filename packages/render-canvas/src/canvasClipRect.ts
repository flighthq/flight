import { enableRenderFeatures } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObjectRenderTreeNode,
  Matrix,
  Rectangle,
  ScrollRectHooks,
} from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

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

export function registerCanvasScrollRectSupport(state: CanvasRenderState): void {
  state.scrollRectHooks = canvasScrollRectHooks;
  enableRenderFeatures(state, RenderFeatures.ScrollRect);
}

const canvasScrollRectHooks: ScrollRectHooks = {
  pop: (state) => popCanvasClipRectangle(state as CanvasRenderState),
  push: (state, data) => pushCanvasClipRectangle(state as CanvasRenderState, data.source.scrollRect!, data.transform2D),
};
