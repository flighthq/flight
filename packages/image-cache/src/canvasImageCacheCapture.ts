import { createImageSourceFromCanvas } from '@flighthq/assets';
import { createMatrix, createRectangle, identityMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry';
import type { CanvasRenderStateInternal } from '@flighthq/render-canvas';
import { computeBoundsRectangle, getLocalTransformMatrix } from '@flighthq/scene';
import type { CanvasRenderState, DisplayObject, Matrix } from '@flighthq/types';

import { getImageCache, setImageCache } from './imageCache';
import { beginImageCacheCapture, endImageCacheCapture } from './imageCacheSceneNodeResolver';

type CaptureData = {
  boundsX: number;
  boundsY: number;
  imageSource: ReturnType<typeof createImageSourceFromCanvas> | null;
};

const _captureData = new WeakMap<CanvasRenderState, CaptureData>();

function getCaptureData(state: CanvasRenderState): CaptureData {
  let data = _captureData.get(state);
  if (data === undefined) {
    data = { boundsX: 0, boundsY: 0, imageSource: null };
    _captureData.set(state, data);
  }
  return data;
}

export function beginDisplayObjectImageCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  computeBoundsRectangle(_tempBounds, source, source);

  const w = Math.ceil(_tempBounds.width);
  const h = Math.ceil(_tempBounds.height);
  const internal = cacheState as CanvasRenderStateInternal;

  internal.canvas.width = Math.max(1, w);
  internal.canvas.height = Math.max(1, h);
  internal.context.imageSmoothingEnabled = internal.imageSmoothingEnabled;
  internal.context.imageSmoothingQuality = internal.imageSmoothingQuality;

  const localTransform = getLocalTransformMatrix(source);
  inverseMatrix(_tempMatrix, localTransform);
  identityMatrix(_tempTranslation);
  _tempTranslation.tx = -_tempBounds.x;
  _tempTranslation.ty = -_tempBounds.y;
  multiplyMatrix(internal.renderTransform2D as Matrix, _tempTranslation, _tempMatrix);

  const capture = getCaptureData(cacheState);
  capture.boundsX = _tempBounds.x;
  capture.boundsY = _tempBounds.y;

  beginImageCacheCapture(cacheState);
}

export function endDisplayObjectImageCacheCapture(cacheState: CanvasRenderState, source: DisplayObject): void {
  endImageCacheCapture(cacheState);

  const internal = cacheState as CanvasRenderStateInternal;
  const capture = getCaptureData(cacheState);

  const canvas = internal.canvas;
  let imageSource = capture.imageSource;
  if (imageSource === null) {
    imageSource = createImageSourceFromCanvas(canvas);
    capture.imageSource = imageSource;
  } else {
    imageSource.width = canvas.width;
    imageSource.height = canvas.height;
    imageSource.version = (imageSource.version + 1) >>> 0;
  }

  const existingCache = getImageCache(source);
  const transform = existingCache?.transform ?? createMatrix();
  identityMatrix(transform);
  transform.tx = capture.boundsX;
  transform.ty = capture.boundsY;

  setImageCache(source, { source: imageSource, transform });
}

const _tempBounds = createRectangle();
const _tempMatrix = createMatrix();
const _tempTranslation = createMatrix();
