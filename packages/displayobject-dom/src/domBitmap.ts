import { createEntity } from '@flighthq/entity';
import type {
  Bitmap,
  DisplayObjectRenderer,
  DomRenderState,
  Renderable,
  RendererData,
  RenderProxy2D,
  RenderState,
} from '@flighthq/types';

import { applyDomStyle, prepareDomElement, setDomRendererElement } from './domStyle';

interface DomBitmapData extends RendererData {
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  image: HTMLImageElement | null;
}

function createDomBitmapData(_state: RenderState, _source: Renderable): DomBitmapData {
  return createEntity({ canvas: null, context: null, image: null });
}

export function drawDomBitmap(state: DomRenderState, renderProxy: RenderProxy2D): void {
  const data = renderProxy.rendererData as DomBitmapData | null;
  if (data === null) return;

  const source = renderProxy.source as Bitmap;
  const imageSource = source.data.image;
  if (imageSource === null || imageSource.source === null) return;

  const src = imageSource.source;
  const sr = source.data.sourceRectangle ?? null;

  if (sr === null && src instanceof HTMLImageElement) {
    renderBitmapAsImage(state, renderProxy, data, src);
  } else {
    renderBitmapAsCanvas(state, renderProxy, data, imageSource.width, imageSource.height, src, sr);
  }
}

function renderBitmapAsImage(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomBitmapData,
  src: HTMLImageElement,
): void {
  if (data.canvas !== null) {
    data.canvas = null;
    data.context = null;
  }

  if (data.image === null) {
    data.image = document.createElement('img');
    data.image.crossOrigin = 'anonymous';
    prepareDomElement(data.image);
  }

  if (data.image.src !== src.src) {
    data.image.src = src.src;
  }

  applyDomStyle(state, data.image, renderProxy);
  setDomRendererElement(state, data.image);
}

function renderBitmapAsCanvas(
  state: DomRenderState,
  renderProxy: RenderProxy2D,
  data: DomBitmapData,
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
    prepareDomElement(data.canvas);
  }

  const source = renderProxy.source as Bitmap;
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

  applyDomStyle(state, data.canvas, renderProxy);
  setDomRendererElement(state, data.canvas);
}

export const defaultDomBitmapRenderer: DisplayObjectRenderer = {
  createData: createDomBitmapData,
  submit: drawDomBitmap,
};
