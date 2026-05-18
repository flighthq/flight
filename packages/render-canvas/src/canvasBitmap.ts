import { createNullRendererData } from '@flighthq/render-core';
import type { Bitmap, CanvasRenderState, DisplayObjectRenderer, DisplayObjectRenderNode } from '@flighthq/types';

import { drawCanvasDisplayObject, drawCanvasDisplayObjectMask } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasBitmap(state: CanvasRenderState, bitmap: DisplayObjectRenderNode): void {
  drawCanvasDisplayObject(state, bitmap);
  const source = bitmap.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource !== null && imageSource.src !== null) {
    const context = state.context;

    setCanvasBlendMode(state, bitmap.blendMode);

    context.globalAlpha = bitmap.alpha;
    const scrollRect = source.scrollRect;

    setCanvasTransform(state, context, bitmap.transform2D);

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }

    if (scrollRect === null) {
      context.drawImage(imageSource.src, 0, 0, imageSource.width, imageSource.height);
    } else {
      context.drawImage(
        imageSource.src,
        scrollRect.x,
        scrollRect.y,
        scrollRect.width,
        scrollRect.height,
        scrollRect.x,
        scrollRect.y,
        scrollRect.width,
        scrollRect.height,
      );
    }

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = true;
    }
  }
}

export function drawCanvasBitmapMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  drawCanvasDisplayObjectMask(state, data);
}

export const defaultCanvasBitmapRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasBitmap,
  drawMask: drawCanvasBitmapMask,
};
