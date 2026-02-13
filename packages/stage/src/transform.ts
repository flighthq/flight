import { matrix2D } from '@flighthq/math';
import type { DisplayObject, Vector2 } from '@flighthq/types';

import { getCurrentWorldTransform } from './derived';

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal(out: Vector2, source: DisplayObject, pos: Readonly<Vector2>): void {
  matrix2D.inverseTransformPointXY(out, getCurrentWorldTransform(source), pos.x, pos.y);
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal(out: Vector2, source: DisplayObject, point: Readonly<Vector2>): void {
  matrix2D.transformPointXY(out, getCurrentWorldTransform(source), point.x, point.y);
}
