import { matrix3x2, rectangle, rectanglePool } from '@flighthq/math';
import type { DisplayObject } from '@flighthq/types';

import { calculateBoundsRect, getLocalBoundsRect } from './bounds';
import { getWorldTransform } from './transform';

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (other.parent !== null && source.parent !== null) {
    const sourceBounds = getLocalBoundsRect(source);
    const otherBounds = rectanglePool.get();
    // compare other in source's coordinate space
    calculateBoundsRect(otherBounds, other, source);
    const result = rectangle.intersects(sourceBounds, otherBounds);
    rectanglePool.release(otherBounds);
    return result;
  }
  return false;
}

let _tempPoint = { x: 0, y: 0 };

/**
  Evaluates the display object to see if it overlaps or intersects with the
  point specified by the `x` and `y` parameters in world coordinates.

  @param shapeFlag Whether to check against the actual pixels of the object
          (`true`) or the bounding box
          (`false`).
**/
export function hitTestPoint(source: DisplayObject, x: number, y: number, _shapeFlag: boolean = false): boolean {
  if (!source.visible || source.opaqueBackground === null) return false;
  matrix3x2.inverseTransformPointXY(_tempPoint, getWorldTransform(source), x, y);
  return rectangle.contains(getLocalBoundsRect(source), _tempPoint.x, _tempPoint.y);
}
