import { createNullRendererData } from '@flighthq/render';
import type { CanvasRenderState, DisplayObjectRenderer, DisplayObjectRenderNode, Video } from '@flighthq/types';

import { drawCanvasDisplayObject, drawCanvasDisplayObjectMask } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasVideo(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, renderNode);
  const source = renderNode.source as Video;
  const element = source.data.source?.element;
  if (element !== undefined && element !== null && element.readyState >= 2) {
    const context = state.context;
    setCanvasBlendMode(state, renderNode.blendMode);
    context.globalAlpha = renderNode.alpha;
    setCanvasTransform(state, context, renderNode.transform2D);
    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }
    context.drawImage(element, 0, 0, element.videoWidth, element.videoHeight);
    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = true;
    }
  }
}

export function drawCanvasVideoMask(state: CanvasRenderState, renderNode: DisplayObjectRenderNode): void {
  drawCanvasDisplayObjectMask(state, renderNode);
}

export const defaultCanvasVideoRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasVideo,
};
