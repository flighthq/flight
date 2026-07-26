import { inverseMatrixTransformPointXY } from '@flighthq/geometry/contract';
import { getNodeWorldMatrix } from '@flighthq/node/contract';
import { containsPathPoint } from '@flighthq/path/contract';
import { getShapeFillRegions } from '@flighthq/shape/contract';
import type { Node2D, NodeAny, Shape } from '@flighthq/types/contract';
import { Scale9ShapeKind, ShapeKind } from '@flighthq/types/contract';

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

  inverseMatrixTransformPointXY(shapeHitTestLocalPoint, getNodeWorldMatrix(source as Node2D), x, y);
  for (const region of regions) {
    if (containsPathPoint(region.path, shapeHitTestLocalPoint.x, shapeHitTestLocalPoint.y)) return 0;
  }
  return -1;
}

const shapeHitTestLocalPoint = { x: 0, y: 0 };
