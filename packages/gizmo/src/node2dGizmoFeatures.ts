import { copyRectangle, matrixTransformPointXY } from '@flighthq/geometry/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { getNodeWorldBoundsRectangle, getNodeWorldMatrix } from '@flighthq/node/contract';
import type { GizmoNode2DFeatures, Node2D, Rectangle, Vector2Like } from '@flighthq/types/contract';

export function createNode2DGizmoFeatures(): GizmoNode2DFeatures<Node2D> {
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
