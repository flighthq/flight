import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { containsPathPoint } from '@flighthq/path';
import { getShapeFillRegions } from '@flighthq/shape';
import type { DisplayObject, NodeAny, Shape } from '@flighthq/types';
import { Scale9ShapeKind, ShapeKind } from '@flighthq/types';

import { hitTestGraphLocalBounds, registerHitTestPoint } from './hitTests';

/**
 * Opt-in Tier-2 accuracy for shapes: replaces the coarse Shape/Scale9Shape hit handlers with a
 * winding-accurate one, so a point counts only where it falls inside actual filled geometry (not the
 * bounding box). Tier-1 (`shapeFlag=false`) stays the bounds box.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/shape` + `@flighthq/path`, so the base
 * interaction bundle and `registerDefaultHitTestPoints` stay free of them (tree-shaken unless referenced).
 */
export function registerAccurateShapeHitTest(): void {
  registerHitTestPoint(ShapeKind, hitTestShapeWinding);
  registerHitTestPoint(Scale9ShapeKind, hitTestShapeWinding);
}

function hitTestShapeWinding(source: NodeAny, x: number, y: number, shapeFlag: boolean): boolean {
  if (!shapeFlag) return hitTestGraphLocalBounds(source, x, y);

  const regions = getShapeFillRegions((source as Shape).data.commands);
  if (regions === null) return hitTestGraphLocalBounds(source, x, y);

  inverseMatrixTransformPointXY(shapeHitTestLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  for (const region of regions) {
    if (containsPathPoint(region.path, shapeHitTestLocalPoint.x, shapeHitTestLocalPoint.y)) return true;
  }
  return false;
}

const shapeHitTestLocalPoint = { x: 0, y: 0 };
