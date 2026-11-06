import type { NonEntityCreateResult } from '@flighthq/entity/contract';
import { copyRectangle, matrixTransformPointXY } from '@flighthq/geometry/contract';
import type { Rectangle, Vector2Like } from '@flighthq/geometry/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { getNodeWorldBoundsRectangle, getNodeWorldMatrix } from '@flighthq/node/contract';
import type { Node2D } from '@flighthq/scene2d/contract';

import type { GizmoNode2DFeatures } from './types.ts';

export function createNode2DGizmoFeatures(): NonEntityCreateResult<GizmoNode2DFeatures<Node2D>, 'type-only'> {
  return {
    getWorldBoundsRectangle: getNode2DGizmoWorldBoundsRectangle,
    getWorldOrigin: getNode2DGizmoWorldOrigin,
    getWorldRotation: getNode2DGizmoWorldRotation,
  };
}

function getNode2DGizmoWorldBoundsRectangle(out: Rectangle, node: Readonly<Node2D>): boolean {
  copyRectangle(out, getNodeWorldBoundsRectangle(node));
  return true;
}

function getNode2DGizmoWorldOrigin(out: Vector2Like, node: Readonly<Node2D>): void {
  matrixTransformPointXY(out, getNodeWorldMatrix(node), node.pivotX, node.pivotY);
}

function getNode2DGizmoWorldRotation(node: Readonly<Node2D>): number {
  const matrix = getNodeWorldMatrix(node);
  return Math.atan2(matrix.b, matrix.a) * RAD_TO_DEG;
}
