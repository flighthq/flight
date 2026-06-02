import { createNullRendererData } from '@flighthq/render';
import {
  initDOMElement,
  setDOMBlendMode,
  setDOMRendererElement,
  setDOMTransformWithOffset,
} from '@flighthq/render-dom';
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  DOMRenderState,
  RenderState,
} from '@flighthq/types';

import { isImageCachePrimitive } from './imageCachePrimitive';
import { registerImageCacheRenderer } from './imageCacheSceneNodeResolver';

const _canvases = new WeakMap<
  DisplayObjectRenderTreeNode,
  { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
>();

function drawDOMImageCache(state: RenderState, data: DisplayObjectRenderTreeNode): void {
  const source = data.presentationSource;
  if (!isImageCachePrimitive(source)) return;
  const cache = source.cache;
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
  setDOMTransformWithOffset(canvas, data.transform2D, 0, 0, domState.roundPixels);
  canvas.style.opacity = data.alpha < 1 ? String(data.alpha) : '';
  canvas.style.imageRendering = state.allowSmoothing ? '' : 'pixelated';
  setDOMBlendMode(canvas, data.blendMode);

  setDOMRendererElement(state as DOMRenderState, canvas);
}

function drawDOMImageCacheMask(_state: RenderState, _node: DisplayObjectRenderTreeNode): void {}

export const defaultDOMImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawDOMImageCache,
};

export const defaultDOMImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawDOMImageCacheMask,
};

export function enableDOMImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultDOMImageCacheRenderer);
}
