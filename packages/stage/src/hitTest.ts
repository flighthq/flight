import { Affine2D, Rectangle, RectanglePool } from '@flighthq/math';
import type { DisplayObject } from '@flighthq/types';

import { getBounds } from './bounds';
import { getCurrentLocalBounds, getCurrentWorldTransform } from './derived';

/**
 * Evaluates the bounding box of the display object to see if it overlaps or
 * intersects with the bounding box of the `obj` display object.
 **/
export function hitTestObject(source: DisplayObject, other: DisplayObject): boolean {
  if (other.parent !== null && source.parent !== null) {
    const sourceBounds = getCurrentLocalBounds(source);
    const otherBounds = RectanglePool.get();
    // compare other in source's coordinate space
    getBounds(otherBounds, other, source);
    const result = Rectangle.intersects(sourceBounds, otherBounds);
    RectanglePool.release(otherBounds);
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
  Affine2D.inverseTransformPointXY(_tempPoint, getCurrentWorldTransform(source), x, y);
  return Rectangle.contains(getCurrentLocalBounds(source), _tempPoint.x, _tempPoint.y);
}
