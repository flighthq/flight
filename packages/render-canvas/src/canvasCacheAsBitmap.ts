import { createMatrix3x2, createRectangle, mat3x2Concat, mat3x2Identity, mat3x2Inverse } from '@flighthq/geometry';
import { calculateBoundsRect } from '@flighthq/scenegraph-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type {
  CanvasRenderState,
  DisplayObject,
  DisplayObjectRenderNode,
  DisplayObjectRuntime,
  ImageCacheResult,
  Matrix3x2,
} from '@flighthq/types';

import { setCanvasTransform } from './canvasTransform';

const _tempBounds = createRectangle();
const _tempDrawTransform = createMatrix3x2();

export function renderToImageCache(
  _state: CanvasRenderState,
  source: DisplayObject,
  matrix: Readonly<Matrix3x2> | null = null,
  opaqueBackground: number | null = null,
): void {
  calculateBoundsRect(_tempBounds, source, source);

  const w = Math.ceil(_tempBounds.width);
  const h = Math.ceil(_tempBounds.height);

  const runtime = getDisplayObjectRuntime(source) as DisplayObjectRuntime;

  if (w <= 0 || h <= 0) {
    runtime.imageCache = null;
    return;
  }

  const existing = runtime.imageCache;
  const canvas = existing?.canvas ?? document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (ctx === null) return;

  ctx.clearRect(0, 0, w, h);

  if (opaqueBackground !== null) {
    const r = (opaqueBackground >> 16) & 0xff;
    const g = (opaqueBackground >> 8) & 0xff;
    const b = opaqueBackground & 0xff;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);
  }

  // TODO: render display object subtree into offscreen canvas

  const transform = existing?.transform ?? createMatrix3x2();
  if (matrix !== null) {
    mat3x2Inverse(transform, matrix);
    transform.tx += _tempBounds.x;
    transform.ty += _tempBounds.y;
  } else {
    mat3x2Identity(transform);
    transform.tx = _tempBounds.x;
    transform.ty = _tempBounds.y;
  }

  runtime.imageCache = { canvas, transform };
}

export function drawImageCacheResult(
  state: CanvasRenderState,
  renderNode: DisplayObjectRenderNode,
  cache: ImageCacheResult,
): void {
  if (cache.canvas === null) return;
  mat3x2Concat(_tempDrawTransform, cache.transform, renderNode.transform2D);
  setCanvasTransform(state, state.context, _tempDrawTransform);
  state.context.drawImage(cache.canvas, 0, 0);
}
