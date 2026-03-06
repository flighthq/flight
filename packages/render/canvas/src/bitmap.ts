import { registerRenderer } from '@flighthq/render-core';
import type { Bitmap, CanvasRenderState, Renderable, Renderer, RendererData, RenderNode } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { applyDisplayObjectMask, renderDisplayObject } from './displayObject';
import { setBlendMode } from './materials';
import { setTransform } from './transform';

export const BitmapRenderer: Renderer = {
  applyMask: applyBitmapMask,
  createData: createBitmapRendererData,
  render: renderBitmap,
};

export function applyBitmapMask(state: CanvasRenderState, data: RenderNode): void {
  applyDisplayObjectMask(state, data);
}

export function createBitmapRendererData(_state: CanvasRenderState, _source: Renderable): RendererData | null {
  return null;
}

export function registerBitmapRenderer(state: CanvasRenderState, renderer: Renderer = BitmapRenderer): void {
  registerRenderer(state, BitmapKind, renderer);
}

export function renderBitmap(state: CanvasRenderState, bitmap: RenderNode): void {
  renderDisplayObject(state, bitmap);
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
