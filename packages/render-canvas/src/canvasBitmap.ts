import { createNullRendererData, hasRenderFeatures } from '@flighthq/render';
import type { Bitmap, CanvasRenderState, DisplayObjectRenderer, DisplayObjectRenderTreeNode } from '@flighthq/types';
import { RenderFeatures } from '@flighthq/types';

import { drawCanvasDisplayObject, drawCanvasDisplayObjectMask } from './canvasDisplayObject';
import { setCanvasBlendMode } from './canvasMaterials';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasBitmap(state: CanvasRenderState, bitmap: DisplayObjectRenderTreeNode): void {
  drawCanvasDisplayObject(state, bitmap);
  const source = bitmap.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource !== null && imageSource.src !== null) {
    const context = state.context;

    if (hasRenderFeatures(state, RenderFeatures.BlendMode)) setCanvasBlendMode(state, bitmap.blendMode);

    context.globalAlpha = bitmap.alpha;
    const scrollRectangle = hasRenderFeatures(state, RenderFeatures.ScrollRectangle) ? source.scrollRectangle : null;

    setCanvasTransform(state, context, bitmap.transform2D);

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }

    if (scrollRectangle === null) {
      context.drawImage(imageSource.src, 0, 0, imageSource.width, imageSource.height);
    } else {
      context.drawImage(
        imageSource.src,
        scrollRectangle.x,
        scrollRectangle.y,
        scrollRectangle.width,
        scrollRectangle.height,
        scrollRectangle.x,
        scrollRectangle.y,
        scrollRectangle.width,
        scrollRectangle.height,
      );
    }

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = true;
    }
  }
}

export function drawCanvasBitmapMask(state: CanvasRenderState, data: DisplayObjectRenderTreeNode): void {
  drawCanvasDisplayObjectMask(state, data);
}

export const defaultCanvasBitmapRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasBitmap,
};
