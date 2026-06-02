import { setCanvasTransform } from '@flighthq/render-canvas';
import { createNullRendererData } from '@flighthq/render';
import type {
  CanvasRenderState,
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  RenderState,
} from '@flighthq/types';

import { isImageCachePrimitive } from './imageCachePrimitive';
import { registerImageCacheRenderer } from './imageCacheSceneNodeResolver';

function drawCanvasImageCache(state: RenderState, renderNode: DisplayObjectRenderTreeNode): void {
  const source = renderNode.presentationSource;
  if (!isImageCachePrimitive(source)) return;
  const cache = source.cache;
  if (cache.source === null || cache.source.src === null) return;
  const canvasState = state as CanvasRenderState;
  setCanvasTransform(canvasState, canvasState.context, renderNode.transform2D);
  canvasState.context.drawImage(cache.source.src, 0, 0);
}

function drawCanvasImageCacheMask(state: RenderState, renderNode: DisplayObjectRenderTreeNode): void {
  const source = renderNode.presentationSource;
  if (!isImageCachePrimitive(source)) return;
  const cache = source.cache;
  if (cache.source === null || cache.source.src === null) return;
  const canvasState = state as CanvasRenderState;
  canvasState.context.rect(0, 0, cache.source.width, cache.source.height);
}

export const defaultCanvasImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasImageCache,
};

export const defaultCanvasImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawCanvasImageCacheMask,
};

export function enableCanvasImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultCanvasImageCacheRenderer);
}
