import { matrix2D, matrix2DPool, rectangle } from '@flighthq/math';
import type { DisplayObject, Rectangle } from '@flighthq/types';

import { getCurrentLocalBounds, getCurrentWorldTransform } from './derived';

/**
 * Returns a rectangle that defines the area of the display object relative
 * to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function getBounds(
  out: Rectangle,
  source: DisplayObject,
  targetCoordinateSpace: DisplayObject | null | undefined,
): void {
  const localBounds = getCurrentLocalBounds(source);
  if (targetCoordinateSpace && targetCoordinateSpace !== source) {
    const transform = matrix2DPool.get();
    matrix2D.inverse(transform, getCurrentWorldTransform(targetCoordinateSpace));
    matrix2D.multiply(transform, transform, getCurrentWorldTransform(source));
    matrix2D.transformRect(out, transform, localBounds);
    matrix2DPool.release(transform);
  } else {
    rectangle.copy(out, localBounds);
  }
}

/**
 * Returns a rectangle that defines the boundary of the display object, based
 * on the coordinate system defined by the `targetCoordinateSpace`
 * parameter, excluding any strokes on shapes. The values that the
 * `getRect()` method returns are the same or smaller than those
 * returned by the `getBounds()` method.
 **/
export function getRect(
  out: Rectangle,
  source: DisplayObject,
  targetCoordinateSpace: DisplayObject | null | undefined,
): void {
  // TODO: Fill bounds only
  getBounds(out, source, targetCoordinateSpace);
}
