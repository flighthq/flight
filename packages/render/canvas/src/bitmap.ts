import type { Bitmap, CanvasRendererState, RenderNode } from '@flighthq/types';

import { setBlendMode } from './materials';
import { setTransform } from './transform';

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
