import { createImageSourceFromCanvas } from '@flighthq/assets';
import { copyMatrix, createMatrix, createRectangle } from '@flighthq/geometry';
import type { CanvasRenderStateInternal } from '@flighthq/render-canvas';
import {
  beginCanvasRenderTarget,
  createCanvasRenderTarget,
  endCanvasRenderTarget,
  renderCanvasDisplayObject,
  resizeCanvasRenderTarget,
} from '@flighthq/render-canvas';
import { updateDisplayObjectBeforeRender } from '@flighthq/render';
import { computeBoundsRectangle } from '@flighthq/scene';
import type { CanvasRenderState, DisplayObject, Matrix } from '@flighthq/types';

import { getImageCache, setImageCache } from './imageCache';
import { beginImageCacheCapture, endImageCacheCapture } from './imageCacheSceneNodeResolver';
import { computeRenderTargetSize, updateDisplayObjectRenderTargetPlacement } from '@flighthq/render';

export type CaptureImageCacheOptions = {
  /** Uniform padding (pixels) added around the source bounds. Defaults to 0. */
  padding?: number;
  /** Minimum target width in pixels. Defaults to 1. */
  minWidth?: number;
  /** Minimum target height in pixels. Defaults to 1. */
  minHeight?: number;
};

// â”€â”€â”€ Per-state data for begin/end pair â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CaptureData = {
  /** Pre-allocated cache transform, updated on each begin and passed to setImageCache. */
  cacheTransform: Matrix;
  /** Pre-allocated render transform, written into state.renderTransform2D on each begin. */
  renderTransform: Matrix;
  /** Image source reused across captures to avoid re-allocating on every frame. */
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

// â”€â”€â”€ Per-source render targets for captureDisplayObjectImageCache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const _captureTargets = new WeakMap<DisplayObject, ReturnType<typeof createCanvasRenderTarget>>();

// â”€â”€â”€ begin/end API (backward-compatible, dedicated cacheState pattern) â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Prepares `cacheState` to render `source` into its own canvas. Resizes the
 * canvas to the source's local bounds and sets the renderTransform so the
 * source content starts at canvas pixel (0, 0).
 *
 * Pair with `endDisplayObjectImageCacheCapture`.
 */
export function beginDisplayObjectImageCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  computeBoundsRectangle(_tempBounds, source, source);

  const w = Math.ceil(_tempBounds.width);
  const h = Math.ceil(_tempBounds.height);
  const internal = cacheState as CanvasRenderStateInternal;

  internal.canvas.width = Math.max(1, w);
  internal.canvas.height = Math.max(1, h);
  internal.context.imageSmoothingEnabled = internal.imageSmoothingEnabled;
  internal.context.imageSmoothingQuality = internal.imageSmoothingQuality;

  const captureData = getCaptureData(cacheState);
  updateDisplayObjectRenderTargetPlacement(
    source,
    _tempBounds,
    captureData.renderTransform,
    captureData.cacheTransform,
  );
  copyMatrix(internal.renderTransform2D as Matrix, captureData.renderTransform);

  beginImageCacheCapture(cacheState);
}

/**
 * Captures `source` and its subtree into a dedicated per-source render target
 * and installs the result as the image cache. Unlike the begin/end pair, this
 * function does not require a separate dedicated `cacheState`; pass any
 * `CanvasRenderState` that has the right renderers registered.
 *
 * Supports optional padding for filter effects (glow, drop shadow, blur) that
 * need the target to be larger than the source bounds.
 */
export function captureDisplayObjectImageCache(
  state: CanvasRenderState,
  source: DisplayObject,
  options?: CaptureImageCacheOptions,
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
  updateDisplayObjectRenderTargetPlacement(
    source,
    _tempBounds,
    captureData.renderTransform,
    captureData.cacheTransform,
    { contentX, contentY },
  );

  beginCanvasRenderTarget(state, target, captureData.renderTransform);
  beginImageCacheCapture(state);
  updateDisplayObjectBeforeRender(state, source);
  renderCanvasDisplayObject(state, source);
  endImageCacheCapture(state);
  endCanvasRenderTarget(state);

  const existingCache = getImageCache(source);
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
  setImageCache(source, { source: imageSource, transform });
}

// â”€â”€â”€ One-shot convenience â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Finalises the capture started by `beginDisplayObjectImageCacheCapture`.
 * Wraps the canvas as an ImageSource and installs it as the image cache for
 * `source`. The ImageSource is reused across calls to avoid allocation on
 * repeated per-frame captures.
 */
export function endDisplayObjectImageCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  endImageCacheCapture(cacheState);

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

  const existingCache = getImageCache(source);
  const transform = existingCache?.transform ?? captureData.cacheTransform;
  if (existingCache !== null) copyMatrix(transform, captureData.cacheTransform);

  setImageCache(source, { source: imageSource, transform });
}

const _tempBounds = createRectangle();
