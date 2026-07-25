import {
  computeRectangleIntersection,
  containsRectanglePointXY,
  enclosesRectangle,
  intersectsRectangle,
} from '@flighthq/geometry';
import { getNodeWorldBoundsRectangle } from '@flighthq/node';
import type { Node2D, Rectangle } from '@flighthq/types';

export function containsNode2D(outer: Node2D, inner: Node2D): boolean {
  return enclosesRectangle(getNodeWorldBoundsRectangle(outer), getNodeWorldBoundsRectangle(inner));
}

export function getNode2DOverlapRectangle(source: Node2D, other: Node2D, out: Rectangle): Rectangle {
  computeRectangleIntersection(out, getNodeWorldBoundsRectangle(source), getNodeWorldBoundsRectangle(other));
  return out;
}

export function hitTestNode2DsShape(source: Node2D, other: Node2D): boolean {
  const a = getNodeWorldBoundsRectangle(source);
  const b = getNodeWorldBoundsRectangle(other);
  if (!intersectsRectangle(a, b)) return false;
  const aCenterX = a.x + a.width * 0.5;
  const aCenterY = a.y + a.height * 0.5;
  const bCenterX = b.x + b.width * 0.5;
  const bCenterY = b.y + b.height * 0.5;
  return containsRectanglePointXY(a, bCenterX, bCenterY) || containsRectanglePointXY(b, aCenterX, aCenterY);
}
