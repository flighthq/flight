import { noopRendererData } from '@flighthq/render';
import type { Bitmap, CanvasRenderState, DisplayObjectRenderer, RenderProxy2D } from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { resolveCanvasImageSource } from './canvasImageSource';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasBitmap(state: CanvasRenderState, bitmap: RenderProxy2D): void {
  drawCanvasDisplayObject(state, bitmap);
  const source = bitmap.source as Bitmap;
  const imageSource = source.data.image;
  // Resolve to a drawable element, materializing one from raw pixels for a data-only Surface so it
  // draws here instead of silently no-opping.
  const drawable = imageSource !== null ? resolveCanvasImageSource(state, imageSource) : null;
  if (imageSource !== null && drawable !== null) {
    const context = state.context;

    state.applyBlendMode?.(state, bitmap.blendMode);

    context.globalAlpha = bitmap.alpha;
    const sourceRectangle = source.data.sourceRectangle ?? null;

    setCanvasTransform(state, context, bitmap.transform2D);

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }

    if (sourceRectangle === null) {
      context.drawImage(drawable, 0, 0, imageSource.width, imageSource.height);
    } else {
      context.drawImage(
        drawable,
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
