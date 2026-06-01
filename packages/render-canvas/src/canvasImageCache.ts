import { createImageSourceFromCanvas } from '@flighthq/assets';
import { createMatrix, createRectangle, identityMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry';
import { computeBoundsRectangle, getLocalTransformMatrix } from '@flighthq/scenegraph-core';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { CanvasRenderState, DisplayObject, DisplayObjectRuntime, Matrix } from '@flighthq/types';

import type { CanvasRenderStateInternal } from './internal';

export function beginCanvasDisplayObjectImageCache(cacheState: CanvasRenderState, source: DisplayObject): void {
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

  internal.imageCacheBoundsX = _tempBounds.x;
  internal.imageCacheBoundsY = _tempBounds.y;
  internal.skipImageCache = true;
}

export function endCanvasDisplayObjectImageCache(cacheState: CanvasRenderState, source: DisplayObject): void {
  const internal = cacheState as CanvasRenderStateInternal;
  internal.skipImageCache = false;

  const canvas = internal.canvas;
  let imageSource = internal.imageCacheSource;
  if (imageSource === null) {
    imageSource = createImageSourceFromCanvas(canvas);
    internal.imageCacheSource = imageSource;
  } else {
    imageSource.width = canvas.width;
    imageSource.height = canvas.height;
    imageSource.version = (imageSource.version + 1) >>> 0;
  }

  const runtime = getDisplayObjectRuntime(source) as DisplayObjectRuntime;
  const transform = runtime.imageCache?.transform ?? createMatrix();
  identityMatrix(transform);
  transform.tx = internal.imageCacheBoundsX;
  transform.ty = internal.imageCacheBoundsY;

  runtime.imageCache = { source: imageSource, transform };
}

const _tempBounds = createRectangle();
const _tempMatrix = createMatrix();
const _tempTranslation = createMatrix();
