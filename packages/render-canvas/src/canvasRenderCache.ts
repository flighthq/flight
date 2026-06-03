import { createNullRendererData } from '@flighthq/render';
import { isImageRenderCachePrimitive, registerImageRenderCacheRenderer } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
} from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

function drawCanvasRenderImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isImageRenderCachePrimitive(source)) return;
  const cache = source.cache;
  if (cache.source === null || cache.source.src === null) return;
  const canvasState = state as CanvasRenderState;
  setCanvasTransform(canvasState, canvasState.context, renderNode.transform2D);
  canvasState.context.drawImage(cache.source.src, 0, 0);
}

function drawCanvasRenderImageCacheMask(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isImageRenderCachePrimitive(source)) return;
  const cache = source.cache;
  if (cache.source === null || cache.source.src === null) return;
  const canvasState = state as CanvasRenderState;
  canvasState.context.rect(0, 0, cache.source.width, cache.source.height);
}

export const defaultCanvasRenderImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasRenderImageCache,
};

export const defaultCanvasRenderImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawCanvasRenderImageCacheMask,
};

export function enableCanvasRenderImageCache(state: RenderState): void {
  registerImageRenderCacheRenderer(state, defaultCanvasRenderImageCacheRenderer);
}
