import {
  computeRectangleIntersection,
  containsRectanglePointXY,
  enclosesRectangle,
  intersectsRectangle,
} from '@flighthq/geometry';
import { getNodeWorldBoundsRectangle } from '@flighthq/node';
import type { DisplayObject, Rectangle } from '@flighthq/types';

export function containsDisplayObject(outer: DisplayObject, inner: DisplayObject): boolean {
  return enclosesRectangle(getNodeWorldBoundsRectangle(outer), getNodeWorldBoundsRectangle(inner));
}

export function getDisplayObjectOverlapRectangle(
  source: DisplayObject,
  other: DisplayObject,
  out: Rectangle,
): Rectangle {
  computeRectangleIntersection(out, getNodeWorldBoundsRectangle(source), getNodeWorldBoundsRectangle(other));
  return out;
}

export function hitTestDisplayObjectsShape(source: DisplayObject, other: DisplayObject): boolean {
  const a = getNodeWorldBoundsRectangle(source);
  const b = getNodeWorldBoundsRectangle(other);
  if (!intersectsRectangle(a, b)) return false;
  const aCenterX = a.x + a.width * 0.5;
  const aCenterY = a.y + a.height * 0.5;
  const bCenterX = b.x + b.width * 0.5;
  const bCenterY = b.y + b.height * 0.5;
  return containsRectanglePointXY(a, bCenterX, bCenterY) || containsRectanglePointXY(b, aCenterX, aCenterY);
}
