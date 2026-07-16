import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { containsPathPoint } from '@flighthq/path';
import { getShapeFillRegions } from '@flighthq/shape';
import type { DisplayObject, NodeAny, Shape } from '@flighthq/types';
import { Scale9ShapeKind, ShapeKind } from '@flighthq/types';

import { registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for shapes: the `*Precise` queries then hit a Shape/Scale9Shape only where
 * the point falls inside actual filled geometry (winding), not the bounding box. The coarse queries and
 * `registerDefaultHitTests` are unaffected.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/shape` + `@flighthq/path`, so the base
 * interaction bundle stays free of them (tree-shaken unless referenced).
 */
export function registerShapeHitTest(): void {
  registerHitTestPrecise(ShapeKind, hitTestShapeFill);
  registerHitTestPrecise(Scale9ShapeKind, hitTestShapeFill);
}

// Returns 0 when the point is inside any fill region (a hit with no sub-element), -1 otherwise.
function hitTestShapeFill(source: NodeAny, x: number, y: number): number {
  const regions = getShapeFillRegions((source as Shape).data.commands);
  if (regions === null) return -1;

  inverseMatrixTransformPointXY(shapeHitTestLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  for (const region of regions) {
    if (containsPathPoint(region.path, shapeHitTestLocalPoint.x, shapeHitTestLocalPoint.y)) return 0;
  }
  return -1;
}

const shapeHitTestLocalPoint = { x: 0, y: 0 };
