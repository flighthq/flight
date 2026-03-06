import { registerRenderer } from '@flighthq/render-core';
import type { Renderable, RendererData } from '@flighthq/types';
import { type Bitmap, BitmapKind, type CanvasRendererState, type RenderNode } from '@flighthq/types';

import { applyMask } from './masks';
import { setBlendMode } from './materials';
import { setTransform } from './transform';

export function createRendererData(_state: CanvasRendererState, _source: Renderable): RendererData | null {
  return null;
}

export function registerBitmapRenderer(state: CanvasRendererState): void {
  const renderer = {
    applyMask: applyMask,
    createData: createRendererData,
    render: renderBitmap,
  };
  registerRenderer(state, BitmapKind, renderer);
}

export function renderBitmap(state: CanvasRendererState, bitmap: RenderNode): void {
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
