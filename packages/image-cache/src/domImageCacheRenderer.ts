import { createNullRendererData } from '@flighthq/render-core';
import {
  initDOMElement,
  setDOMBlendMode,
  setDOMRendererElement,
  setDOMTransformWithOffset,
} from '@flighthq/render-dom';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, DOMRenderState, RenderState } from '@flighthq/types';

import { registerImageCacheRenderer } from './imageCacheTransformer';

const _canvases = new WeakMap<
  DisplayObjectRenderNode,
  { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
>();

function drawDOMImageCache(state: RenderState, data: DisplayObjectRenderNode): void {
  const cache = getDisplayObjectRuntime(data.source).imageCache;
  if (cache === null) return;
  const imageSource = cache.source;
  if (imageSource === null || imageSource.src === null) return;

  let entry = _canvases.get(data);
  if (entry === undefined) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    initDOMElement(canvas);
    entry = { canvas, context };
    _canvases.set(data, entry);
  }

  const { canvas, context } = entry;
  const w = imageSource.width;
  const h = imageSource.height;

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  context.drawImage(imageSource.src, 0, 0, w, h);

  const domState = state as DOMRenderState;
  setDOMTransformWithOffset(canvas, data.transform2D, cache.transform.tx, cache.transform.ty, domState.roundPixels);
  canvas.style.opacity = data.alpha < 1 ? String(data.alpha) : '';
  canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  setDOMBlendMode(canvas, data.blendMode);

  setDOMRendererElement(state as DOMRenderState, canvas);
}

function drawDOMImageCacheMask(_state: RenderState, _node: DisplayObjectRenderNode): void {}

export const defaultDOMImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawDOMImageCache,
  drawMask: drawDOMImageCacheMask,
};

export function enableDOMImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultDOMImageCacheRenderer);
}
