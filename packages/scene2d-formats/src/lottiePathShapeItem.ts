import type { LottieShapeItemContext, LottieShapePathItem } from '@flighthq/types/contract';

import {
  createLottieBezierPath,
  flattenLottieShapePath,
  toLottieShapePath,
  unflattenLottieShapePath,
} from './lottieBezierPath.ts';
import { appendLottieShapePathChannels, initialLottieValue, isAnimatedLottieProperty } from './lottieDocument.ts';
import { applyLottieShapeDirection } from './lottieShapeGeometry.ts';
/**
 * Reads a Lottie bezier path item: the vertex list the file states, and the per-vertex channels that animate it.
 *
 * ★ THE ONLY GEOMETRY ITEM WHOSE ANIMATION IS NOT NUMERIC PROPERTIES. A rectangle animates three numbers; a bezier
 * path animates every vertex and tangent, which is why `appendLottieShapePathChannels` and the flatten/unflatten
 * pair live here and nowhere else. A static path binds nothing and costs only the builder.
 */
export function lottiePathShapeItemHandler(context: LottieShapeItemContext): void {
  const shape = context.item as Readonly<LottieShapePathItem>;
  const value = toLottieShapePath(initialLottieValue(shape.ks));
  if (value === undefined) return;
  const pathIndex = context.paths.length;
  context.paths.push(applyLottieShapeDirection(createLottieBezierPath(value), shape.d));
  if (!isAnimatedLottieProperty(shape.ks)) return;
  const current = flattenLottieShapePath(value);
  const apply = (): void => {
    context.paths[pathIndex] = applyLottieShapeDirection(
      createLottieBezierPath(unflattenLottieShapePath(value, current)),
      shape.d,
    );
    context.rerender();
  };
  appendLottieShapePathChannels(shape.ks.k, current, apply, context.import);
}
