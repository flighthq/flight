import { createNullRendererData, setRenderer } from '@flighthq/render-core';
import type { Bitmap, CanvasRenderState, DisplayObjectRenderNode, Renderer } from '@flighthq/types';
import { DisplayObjectType } from '@flighthq/types';

import { drawDisplayObject, drawDisplayObjectMask } from './displayObject';
import { setBlendMode } from './materials';
import { setTransform } from './transform';

export const BitmapRenderer: Renderer = {
  createData: createNullRendererData,
  draw: drawBitmap,
  drawMask: drawBitmapMask,
};

export function drawBitmap(state: CanvasRenderState, bitmap: DisplayObjectRenderNode): void {
  drawDisplayObject(state, bitmap);
  const source = bitmap.source as Bitmap;
  if (source.data.image !== null) {
    const context = state.context;

    setBlendMode(state, bitmap.blendMode);

    context.globalAlpha = bitmap.alpha;
    const scrollRect = source.scrollRect;

    setTransform(state, context, bitmap.transform);

    if (!state.allowSmoothing || !source.data.smoothing) {
      context.imageSmoothingEnabled = false;
    }

    const imageSource = source.data.image;

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

export function drawBitmapMask(state: CanvasRenderState, data: DisplayObjectRenderNode): void {
  drawDisplayObjectMask(state, data);
}

export function setBitmapRenderer(state: CanvasRenderState, renderer: Renderer = BitmapRenderer): void {
  setRenderer(state, DisplayObjectType.Bitmap, renderer);
}
