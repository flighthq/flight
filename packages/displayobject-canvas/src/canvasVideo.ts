import { noopRendererData } from '@flighthq/render';
import type { CanvasRenderState, DisplayObjectRenderer, RenderProxy2D, Video } from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasVideo(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasDisplayObject(state, renderProxy);
  const source = renderProxy.source as Video;
  const element = source.data.source?.element;
  if (element !== undefined && element !== null && element.readyState >= 2) {
    const context = state.context;
    state.applyBlendMode?.(state, renderProxy.blendMode);
    context.globalAlpha = renderProxy.alpha;
    setCanvasTransform(state, context, renderProxy.transform2D);
    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }
    context.drawImage(element, 0, 0, element.videoWidth, element.videoHeight);
    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = true;
    }
  }
}

export const defaultCanvasVideoRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasVideo,
};
