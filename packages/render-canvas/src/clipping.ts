import type { CanvasRendererState, Matrix3x2, Rectangle, RenderableData } from '@flighthq/types';

import { setTransform } from './transform';

export function popClipRect(state: CanvasRendererState): void {
  state.context.restore();
}

export function popScrollRect(state: CanvasRendererState): void {
  state.context.restore();
  state.currentScrollRectDepth--;
}

export function pushClipRect(state: CanvasRendererState, rect: Rectangle, transform: Matrix3x2): void {
  state.context.save();

  setTransform(state, state.context, transform);

  state.context.beginPath();
  state.context.rect(rect.x, rect.y, rect.width, rect.height);
  state.context.clip();
}

export function pushScrollRect(state: CanvasRendererState, data: RenderableData): void {
  pushClipRect(state, data.source.scrollRect!, data.transform);
  state.currentScrollRectDepth++;
}
