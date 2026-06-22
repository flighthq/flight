import { noopRendererData } from '@flighthq/render';
import type { Bitmap, CanvasRenderState, DisplayObjectRenderer, RenderProxy2D } from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasBitmap(state: CanvasRenderState, bitmap: RenderProxy2D): void {
  drawCanvasDisplayObject(state, bitmap);
  const source = bitmap.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource !== null && imageSource.source !== null) {
    const context = state.context;

    state.applyBlendMode?.(state, bitmap.blendMode);

    context.globalAlpha = bitmap.alpha;
    const sourceRectangle = source.data.sourceRectangle ?? null;

    setCanvasTransform(state, context, bitmap.transform2D);

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }

    if (sourceRectangle === null) {
      context.drawImage(imageSource.source, 0, 0, imageSource.width, imageSource.height);
    } else {
      context.drawImage(
        imageSource.source,
        sourceRectangle.x,
        sourceRectangle.y,
        sourceRectangle.width,
        sourceRectangle.height,
        0,
        0,
        sourceRectangle.width,
        sourceRectangle.height,
      );
    }

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = true;
    }
  }
}

export const defaultCanvasBitmapRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasBitmap,
};
