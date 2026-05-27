import { createEntity } from '@flighthq/entity';
import type {
  Bitmap,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement } from './domStyle';

interface DOMBitmapData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  image: HTMLImageElement | null;
}

function createDOMBitmapData(_state: RenderState, _source: Renderable): DOMBitmapData {
  return createEntity({ canvas: null, context: null, image: null });
}

export function drawDOMBitmap(state: DOMRenderState, renderNode: DisplayObjectRenderNode): void {
  const data = renderNode.rendererData as DOMBitmapData | null;
  if (data === null) return;

  const source = renderNode.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  const src = imageSource.src;

  if (src instanceof HTMLImageElement) {
    renderBitmapAsImage(state, renderNode, data, src);
  } else {
    renderBitmapAsCanvas(state, renderNode, data, imageSource.width, imageSource.height, src);
  }
}

function renderBitmapAsImage(
  state: DOMRenderState,
  renderNode: DisplayObjectRenderNode,
  data: DOMBitmapData,
  src: HTMLImageElement,
): void {
  if (data.canvas !== null) {
    data.canvas = null;
    data.context = null;
  }

  if (data.image === null) {
    data.image = document.createElement('img');
    data.image.crossOrigin = 'anonymous';
    initDOMElement(data.image);
  }

  if (data.image.src !== src.src) {
    data.image.src = src.src;
  }

  applyDOMStyle(state, data.image, renderNode);
  state.element.appendChild(data.image);
}

function renderBitmapAsCanvas(
  state: DOMRenderState,
  renderNode: DisplayObjectRenderNode,
  data: DOMBitmapData,
  width: number,
  height: number,
  src: CanvasImageSource,
): void {
  if (data.image !== null) {
    data.image = null;
  }

  if (data.canvas === null) {
    data.canvas = document.createElement('canvas');
    data.context = data.canvas.getContext('2d');
    initDOMElement(data.canvas);
  }

  const source = renderNode.source as Bitmap;
  const smoothing = source.data.smoothing && state.allowSmoothing;

  data.canvas.width = width;
  data.canvas.height = height;

  const ctx = data.context!;
  ctx.imageSmoothingEnabled = smoothing;
  ctx.drawImage(src, 0, 0, width, height);

  applyDOMStyle(state, data.canvas, renderNode);
  state.element.appendChild(data.canvas);
}

export function drawDOMBitmapMask(_state: DOMRenderState, _renderNode: DisplayObjectRenderNode): void {
  // Masking not yet supported in DOM renderer
}

export const defaultDOMBitmapRenderer: DisplayObjectRenderer = {
  createData: createDOMBitmapData,
  draw: drawDOMBitmap,
  drawMask: drawDOMBitmapMask,
};
