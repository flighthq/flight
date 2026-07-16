import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { containsPathPoint } from '@flighthq/path';
import { getShapeFillRegions } from '@flighthq/shape';
import type { DisplayObject, NodeAny, Shape } from '@flighthq/types';

import { hitTestGraphLocalBounds } from './hitTests';

export function defaultBitmapHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultHtmlViewHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // HtmlView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultMovieClipHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRenderViewHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultRichTextHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultShapeHitTestPointHandler(source: NodeAny, x: number, y: number, shapeFlag: boolean): boolean {
  // Tier 1 (coarse): local-bounds box. Tier 2 (shapeFlag): winding test against the shape's fill
  // regions — the point counts only when it falls inside actual filled geometry, not the bounding box.
  if (!shapeFlag) return hitTestGraphLocalBounds(source, x, y);

  const regions = getShapeFillRegions((source as Shape).data.commands);
  if (regions === null) return hitTestGraphLocalBounds(source, x, y);

  inverseMatrixTransformPointXY(shapeHitTestLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  for (const region of regions) {
    if (containsPathPoint(region.path, shapeHitTestLocalPoint.x, shapeHitTestLocalPoint.y)) return true;
  }
  return false;
}

export function defaultStageHitTestPointHandler(
  _source: NodeAny,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultTextInputHitTestPointHandler(
  source: NodeAny,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

export function defaultVideoHitTestPointHandler(source: NodeAny, x: number, y: number, _shapeFlag: boolean): boolean {
  return hitTestGraphLocalBounds(source, x, y);
}

const shapeHitTestLocalPoint = { x: 0, y: 0 };
