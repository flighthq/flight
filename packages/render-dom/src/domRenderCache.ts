import { createNullRendererData } from '@flighthq/render';
import { isImageRenderCachePrimitive, registerImageRenderCacheRenderer } from '@flighthq/render';
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  RenderState,
} from '@flighthq/types';

import { initDOMElement, setDOMRendererElement } from './domStyle';
import { setDOMTransformWithOffset } from './domTransform';

const _canvases = new WeakMap<
  DisplayObjectRenderNode,
  { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
>();

function drawDOMRenderImageCache(state: RenderState, data: DisplayObjectRenderNode): void {
  const source = data.source;
  if (!isImageRenderCachePrimitive(source)) return;
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
  domState.applyBlendMode?.(canvas, data.blendMode);

  setDOMRendererElement(state as DOMRenderState, canvas);
}

function drawDOMRenderImageCacheMask(_state: RenderState, _node: DisplayObjectRenderNode): void {}

export const defaultDOMRenderImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawDOMRenderImageCache,
};

export const defaultDOMRenderImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawDOMRenderImageCacheMask,
};

export function enableDOMRenderImageCache(state: RenderState): void {
  registerImageRenderCacheRenderer(state, defaultDOMRenderImageCacheRenderer);
}
