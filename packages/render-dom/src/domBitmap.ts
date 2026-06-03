import { createEntity } from '@flighthq/entity';
import type {
  Bitmap,
  DisplayObjectRenderer,
  DisplayObjectRenderTreeNode,
  DOMRenderState,
  Renderable,
  RendererData,
  RenderState,
} from '@flighthq/types';

import { applyDOMStyle, initDOMElement, setDOMRendererElement } from './domStyle';

interface DOMBitmapData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  image: HTMLImageElement | null;
}

function createDOMBitmapData(_state: RenderState, _source: Renderable): DOMBitmapData {
  return createEntity({ canvas: null, context: null, image: null });
}

export function drawDOMBitmap(state: DOMRenderState, renderNode: DisplayObjectRenderTreeNode): void {
  const data = renderNode.rendererData as DOMBitmapData | null;
  if (data === null) return;

  const source = renderNode.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.src === null) return;

  const src = imageSource.src;
  const sr = source.data.sourceRectangle;

  if (sr === null && src instanceof HTMLImageElement) {
    renderBitmapAsImage(state, renderNode, data, src);
  } else {
    renderBitmapAsCanvas(state, renderNode, data, imageSource.width, imageSource.height, src, sr);
  }
}

function renderBitmapAsImage(
  state: DOMRenderState,
  renderNode: DisplayObjectRenderTreeNode,
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
  setDOMRendererElement(state, data.image);
}

function renderBitmapAsCanvas(
  state: DOMRenderState,
  renderNode: DisplayObjectRenderTreeNode,
  data: DOMBitmapData,
  width: number,
  height: number,
  src: CanvasImageSource,
  sourceRectangle: { x: number; y: number; width: number; height: number } | null = null,
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

  const drawWidth = sourceRectangle !== null ? sourceRectangle.width : width;
  const drawHeight = sourceRectangle !== null ? sourceRectangle.height : height;
  data.canvas.width = drawWidth;
  data.canvas.height = drawHeight;

  const ctx = data.context!;
  ctx.imageSmoothingEnabled = smoothing;
  if (sourceRectangle !== null) {
    ctx.drawImage(
      src,
      sourceRectangle.x,
      sourceRectangle.y,
      sourceRectangle.width,
      sourceRectangle.height,
      0,
      0,
      sourceRectangle.width,
      sourceRectangle.height,
    );
  } else {
    ctx.drawImage(src, 0, 0, width, height);
  }

  applyDOMStyle(state, data.canvas, renderNode);
  setDOMRendererElement(state, data.canvas);
}

export function drawDOMBitmapMask(state: DOMRenderState, renderNode: DisplayObjectRenderTreeNode): void {
  drawDOMBitmap(state, renderNode);
}

export const defaultDOMBitmapRenderer: DisplayObjectRenderer = {
  createData: createDOMBitmapData,
  draw: drawDOMBitmap,
};
