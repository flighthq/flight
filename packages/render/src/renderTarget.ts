import { createMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry';
import { getLocalTransformMatrix } from '@flighthq/scene';
import type { DisplayObject, MatrixLike, RectangleLike } from '@flighthq/types';

export type RenderTargetSizeOptions = {
  minWidth?: number;
  minHeight?: number;
};

/**
 * Writes into outRenderTransform the transform to set as state.renderTransform2D when
 * capturing source into a render target. Maps source content into target pixel space so
 * that the bounds origin lands at (contentX, contentY).
 */
export function computeDisplayObjectRenderTargetTransform(
  outRenderTransform: MatrixLike,
  source: DisplayObject,
  bounds: Readonly<RectangleLike>,
  contentX: number = 0,
  contentY: number = 0,
): void {
  const localTransform = getLocalTransformMatrix(source);
  inverseMatrix(_tempInvLocal, localTransform);
  _tempTranslation.a = 1;
  _tempTranslation.b = 0;
  _tempTranslation.c = 0;
  _tempTranslation.d = 1;
  _tempTranslation.tx = contentX - bounds.x;
  _tempTranslation.ty = contentY - bounds.y;
  multiplyMatrix(outRenderTransform, _tempTranslation, _tempInvLocal);
}

/**
 * Writes into outCacheTransform the presentationTransform2D to store on the resolved
 * render node so the cached image is placed back at the original scene position.
 */
export function computeImageRenderCacheTransform(
  outCacheTransform: MatrixLike,
  bounds: Readonly<RectangleLike>,
  contentX: number = 0,
  contentY: number = 0,
): void {
  outCacheTransform.a = 1;
  outCacheTransform.b = 0;
  outCacheTransform.c = 0;
  outCacheTransform.d = 1;
  outCacheTransform.tx = bounds.x - contentX;
  outCacheTransform.ty = bounds.y - contentY;
}

export function computeRenderTargetSize(
  bounds: Readonly<RectangleLike>,
  padding: number = 0,
  minWidth: number = 1,
  minHeight: number = 1,
): { width: number; height: number } {
  return {
    width: Math.max(minWidth, Math.ceil(bounds.width) + padding * 2),
    height: Math.max(minHeight, Math.ceil(bounds.height) + padding * 2),
  };
}

const _tempInvLocal = createMatrix();
const _tempTranslation = createMatrix();
