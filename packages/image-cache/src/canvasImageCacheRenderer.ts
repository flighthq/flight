import { createMatrix, multiplyMatrix } from '@flighthq/geometry';
import { setCanvasTransform } from '@flighthq/render-canvas';
import { createNullRendererData } from '@flighthq/render-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { CanvasRenderState, DisplayObjectRenderer, DisplayObjectRenderNode, RenderState } from '@flighthq/types';

import { registerImageCacheRenderer } from './imageCacheTransformer';

const _tempDrawTransform = createMatrix();

function drawCanvasImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const cache = getDisplayObjectRuntime(renderNode.source).imageCache;
  if (cache === null) return;
  if (cache.source === null || cache.source.src === null) return;
  multiplyMatrix(_tempDrawTransform, renderNode.transform2D, cache.transform);
  const canvasState = state as CanvasRenderState;
  setCanvasTransform(canvasState, canvasState.context, _tempDrawTransform);
  canvasState.context.drawImage(cache.source.src, 0, 0);
}

function drawCanvasImageCacheMask(_state: RenderState, _node: DisplayObjectRenderNode): void {}

export const defaultCanvasImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawCanvasImageCache,
  drawMask: drawCanvasImageCacheMask,
};

export function enableCanvasImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultCanvasImageCacheRenderer);
}
