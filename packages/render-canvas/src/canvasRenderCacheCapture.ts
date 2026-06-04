import { createImageSourceFromCanvas } from '@flighthq/assets';
import { copyMatrix, createMatrix, createRectangle } from '@flighthq/geometry';
import {
  beginImageRenderCacheCapture,
  computeDisplayObjectRenderTargetTransform,
  computeImageRenderCacheTransform,
  computeRenderTargetSize,
  endImageRenderCacheCapture,
  getImageRenderCache,
  setImageRenderCache,
  updateDisplayObject,
} from '@flighthq/render';
import { computeBoundsRectangle } from '@flighthq/scene';
import type { CanvasRenderState, DisplayObject, Matrix } from '@flighthq/types';

import { renderCanvasDisplayObject } from './canvasDisplayObject';
import {
  beginCanvasRenderTarget,
  createCanvasRenderTarget,
  endCanvasRenderTarget,
  resizeCanvasRenderTarget,
} from './canvasRenderTarget';
import type { CanvasRenderStateInternal } from './internal';

export type CaptureImageRenderCacheOptions = {
  padding?: number;
  minWidth?: number;
  minHeight?: number;
};

// ─── Per-state data for begin/end pair ────────────────────────────────────────

type CaptureData = {
  cacheTransform: Matrix;
  renderTransform: Matrix;
  imageSource: ReturnType<typeof createImageSourceFromCanvas> | null;
};

const _captureData = new WeakMap<CanvasRenderState, CaptureData>();

function getCaptureData(state: CanvasRenderState): CaptureData {
  let data = _captureData.get(state);
  if (data === undefined) {
    data = { cacheTransform: createMatrix(), renderTransform: createMatrix(), imageSource: null };
    _captureData.set(state, data);
  }
  return data;
}

// ─── Per-source render targets for captureDisplayObjectRenderImageCache ───────

const _captureTargets = new WeakMap<DisplayObject, ReturnType<typeof createCanvasRenderTarget>>();

// ─── begin/end API ────────────────────────────────────────────────────────────

export function beginDisplayObjectImageRenderCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  computeBoundsRectangle(_tempBounds, source, source);

  const w = Math.ceil(_tempBounds.width);
  const h = Math.ceil(_tempBounds.height);
  const internal = cacheState as CanvasRenderStateInternal;

  internal.canvas.width = Math.max(1, w);
  internal.canvas.height = Math.max(1, h);
  internal.context.imageSmoothingEnabled = internal.imageSmoothingEnabled;
  internal.context.imageSmoothingQuality = internal.imageSmoothingQuality;

  const captureData = getCaptureData(cacheState);
  computeDisplayObjectRenderTargetTransform(captureData.renderTransform, source, _tempBounds);
  computeImageRenderCacheTransform(captureData.cacheTransform, _tempBounds);
  copyMatrix(internal.renderTransform2D as Matrix, captureData.renderTransform);

  beginImageRenderCacheCapture(cacheState);
}

export function captureDisplayObjectRenderImageCache(
  state: CanvasRenderState,
  source: DisplayObject,
  options?: CaptureImageRenderCacheOptions,
): void {
  const padding = options?.padding ?? 0;
  const minWidth = options?.minWidth ?? 1;
  const minHeight = options?.minHeight ?? 1;

  computeBoundsRectangle(_tempBounds, source, source);

  const { width, height } = computeRenderTargetSize(_tempBounds, padding, minWidth, minHeight);
  const contentX = padding;
  const contentY = padding;

  let target = _captureTargets.get(source);
  if (target === undefined) {
    target = createCanvasRenderTarget(width, height);
    _captureTargets.set(source, target);
  } else {
    resizeCanvasRenderTarget(target, width, height);
  }

  const captureData = getCaptureData(state);
  computeDisplayObjectRenderTargetTransform(captureData.renderTransform, source, _tempBounds, contentX, contentY);
  computeImageRenderCacheTransform(captureData.cacheTransform, _tempBounds, contentX, contentY);

  beginCanvasRenderTarget(state, target, captureData.renderTransform);
  beginImageRenderCacheCapture(state);
  updateDisplayObject(state, source);
  renderCanvasDisplayObject(state, source);
  endImageRenderCacheCapture(state);
  endCanvasRenderTarget(state);

  const existingCache = getImageRenderCache(source);
  const existingImageSource = existingCache?.source;
  let imageSource: ReturnType<typeof createImageSourceFromCanvas>;
  if (existingImageSource != null && existingImageSource.src === target.canvas) {
    imageSource = existingImageSource as ReturnType<typeof createImageSourceFromCanvas>;
    imageSource.width = target.canvas.width;
    imageSource.height = target.canvas.height;
    imageSource.version = (imageSource.version + 1) >>> 0;
  } else {
    imageSource = createImageSourceFromCanvas(target.canvas);
  }

  const transform = existingCache?.transform ?? createMatrix();
  copyMatrix(transform, captureData.cacheTransform);
  setImageRenderCache(source, { source: imageSource, transform });
}

export function endDisplayObjectImageRenderCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  endImageRenderCacheCapture(cacheState);

  const internal = cacheState as CanvasRenderStateInternal;
  const captureData = getCaptureData(cacheState);

  const canvas = internal.canvas;
  let imageSource = captureData.imageSource;
  if (imageSource === null) {
    imageSource = createImageSourceFromCanvas(canvas);
    captureData.imageSource = imageSource;
  } else {
    imageSource.width = canvas.width;
    imageSource.height = canvas.height;
    imageSource.version = (imageSource.version + 1) >>> 0;
  }

  const existingCache = getImageRenderCache(source);
  const transform = existingCache?.transform ?? captureData.cacheTransform;
  if (existingCache !== null) copyMatrix(transform, captureData.cacheTransform);

  setImageRenderCache(source, { source: imageSource, transform });
}

const _tempBounds = createRectangle();
