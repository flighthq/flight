import { createMatrix, inverseMatrix, multiplyMatrix } from '@flighthq/geometry';
import { getLocalTransformMatrix } from '@flighthq/scene';
import type { DisplayObject, Matrix, MatrixLike, RectangleLike } from '@flighthq/types';

export type RenderTargetPlacement = {
  /**
   * Set as state.renderTransform2D before calling updateDisplayObjectBeforeRender +
   * renderDisplayObject. Maps source content into the target's pixel space, offset by
   * (contentX, contentY) so that the source bounds origin lands at (contentX, contentY)
   * inside the target.
   */
  renderTransform: Matrix;
  /**
   * Store as the presentationTransform2D / cache result transform. Places the rendered
   * target back at the same position in scene space as the original source content,
   * accounting for any content offset.
   */
  cacheTransform: Matrix;
};

export type RenderTargetPlacementOptions = {
  /** X offset of the source content inside the target canvas/texture. Defaults to 0. */
  contentX?: number;
  /** Y offset of the source content inside the target canvas/texture. Defaults to 0. */
  contentY?: number;
};

/**
 * Convenience: compute the pixel dimensions of a render target for `bounds` with
 * symmetric `padding` and optional minimum size.
 */
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

/**
 * Computes the renderTransform and cacheTransform for a render target capture of `source`.
 *
 * `bounds` should be the source's own local bounds — i.e. the result of
 * `computeBoundsRectangle(source, source)`. The caller is responsible for measuring
 * bounds so that target sizing and padding decisions are made outside this function.
 *
 * contentX / contentY control how much margin exists between the top-left of the
 * render target and the start of the source content. Use these for filter padding
 * (glow, drop shadow, blur) where the output must be larger than the source bounds.
 */
export function createDisplayObjectRenderTargetPlacement(
  source: DisplayObject,
  bounds: Readonly<RectangleLike>,
  options?: RenderTargetPlacementOptions,
): RenderTargetPlacement {
  const contentX = options?.contentX ?? 0;
  const contentY = options?.contentY ?? 0;

  // renderTransform = translation(contentX - bounds.x, contentY - bounds.y) * inverse(localTransform)
  //
  // The render tree computes each node's transform2D as:
  //   parentTransform2D * getLocalTransformMatrix(node)
  // For the root of the captured subtree, parentTransform2D = state.renderTransform2D.
  // After setting renderTransform2D = renderTransform, the source node's transform2D becomes:
  //   renderTransform * source.localTransform
  //   = translation(contentX - bounds.x, contentY - bounds.y) * inverse(LT) * LT
  //   = translation(contentX - bounds.x, contentY - bounds.y)
  // So a vertex at local position (bounds.x, bounds.y) appears at (contentX, contentY)
  // in the target, regardless of the source's own scale or rotation.
  const localTransform = getLocalTransformMatrix(source);
  inverseMatrix(_tempInvLocal, localTransform);
  _tempTranslation.a = 1;
  _tempTranslation.b = 0;
  _tempTranslation.c = 0;
  _tempTranslation.d = 1;
  _tempTranslation.tx = contentX - bounds.x;
  _tempTranslation.ty = contentY - bounds.y;
  const renderTransform = createMatrix();
  multiplyMatrix(renderTransform, _tempTranslation, _tempInvLocal);

  // cacheTransform = translation(bounds.x - contentX, bounds.y - contentY)
  // Places the rendered target image back at the original position in scene space.
  // During normal (non-capture) rendering the resolved node's transform2D becomes:
  //   source.localTransform * cacheTransform
  // so the top-left of the image (pixel 0,0) lands at local position
  // (bounds.x - contentX, bounds.y - contentY), which is exactly the scene position
  // the source content starts at, minus the padding offset.
  const cacheTransform = createMatrix();
  cacheTransform.tx = bounds.x - contentX;
  cacheTransform.ty = bounds.y - contentY;

  return { renderTransform, cacheTransform };
}

/**
 * Writes the renderTransform and cacheTransform into existing matrices, avoiding
 * allocation for hot-path callers (e.g. per-frame image cache updates).
 */
export function updateDisplayObjectRenderTargetPlacement(
  source: DisplayObject,
  bounds: Readonly<RectangleLike>,
  outRenderTransform: MatrixLike,
  outCacheTransform: MatrixLike,
  options?: RenderTargetPlacementOptions,
): void {
  const contentX = options?.contentX ?? 0;
  const contentY = options?.contentY ?? 0;

  const localTransform = getLocalTransformMatrix(source);
  inverseMatrix(_tempInvLocal, localTransform);
  _tempTranslation.a = 1;
  _tempTranslation.b = 0;
  _tempTranslation.c = 0;
  _tempTranslation.d = 1;
  _tempTranslation.tx = contentX - bounds.x;
  _tempTranslation.ty = contentY - bounds.y;
  multiplyMatrix(outRenderTransform, _tempTranslation, _tempInvLocal);

  outCacheTransform.a = 1;
  outCacheTransform.b = 0;
  outCacheTransform.c = 0;
  outCacheTransform.d = 1;
  outCacheTransform.tx = bounds.x - contentX;
  outCacheTransform.ty = bounds.y - contentY;
}

const _tempInvLocal = createMatrix();
const _tempTranslation = createMatrix();
