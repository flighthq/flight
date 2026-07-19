import { getEntityRuntime } from '@flighthq/entity';
import {
  copyMatrix,
  createMatrix,
  inverseMatrixTransformPointXY,
  matrixTransformPointXY,
  multiplyMatrix,
} from '@flighthq/geometry';
import { computeNodeWorldTransformRevision } from '@flighthq/node';
import type { HasTransform2DRuntime, Matrix, NodeRuntime, Transform2DNode, Vector2Like } from '@flighthq/types';

/**
 * Converts the `vector` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function convertNodeVector2GlobalToLocal<Traits extends object>(
  out: Vector2Like,
  source: Transform2DNode<Traits>,
  vector: Readonly<Vector2Like>,
): void {
  inverseMatrixTransformPointXY(out, getNodeWorldMatrix(source), vector.x, vector.y);
}

/**
 * Converts the `vector` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function convertNodeVector2LocalToGlobal<Traits extends object>(
  out: Vector2Like,
  source: Transform2DNode<Traits>,
  vector: Readonly<Vector2Like>,
): void {
  matrixTransformPointXY(out, getNodeWorldMatrix(source), vector.x, vector.y);
}

export function ensureNodeLocalMatrix<Traits extends object>(target: Transform2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime;
  if (runtime.localTransformUsingLocalTransformId !== runtime.localTransformId) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureNodeWorldMatrix<Traits extends object>(target: Transform2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime;
  const parent = runtime.parent as Transform2DNode<Traits>;

  let parentRuntime: (NodeRuntime<Traits> & HasTransform2DRuntime) | undefined;
  let parentWorldTransformId = 0;

  if (parent !== null) {
    ensureNodeWorldMatrix(parent);
    parentRuntime = getEntityRuntime(parent) as NodeRuntime<Traits> & HasTransform2DRuntime;
    parentWorldTransformId = parentRuntime.worldTransformId;
  }

  if (
    runtime.worldTransformUsingLocalTransformId !== runtime.localTransformId ||
    runtime.worldTransformUsingParentTransformId !== parentWorldTransformId
  ) {
    recomputeWorldTransform2D(target, runtime, parentRuntime);
  }
}

export function getNodeLocalMatrix<Traits extends object>(target: Transform2DNode<Traits>): Readonly<Matrix> {
  ensureNodeLocalMatrix(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime).localMatrix!;
}

export function getNodeWorldMatrix<Traits extends object>(target: Transform2DNode<Traits>): Readonly<Matrix> {
  ensureNodeWorldMatrix(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime).worldMatrix!;
}

function recomputeLocalTransform2D<Traits extends object>(
  target: Transform2DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasTransform2DRuntime,
): void {
  if (target.rotation !== runtime.rotationAngle) {
    // Normalize from -180 to 180
    let angle = target.rotation % 360.0;
    if (angle > 180.0) {
      angle -= 360.0;
    } else if (angle < -180.0) {
      angle += 360.0;
    }
    const rad = angle * DEG_TO_RAD;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    runtime.rotationAngle = angle;
    runtime.rotationSine = sin;
    runtime.rotationCosine = cos;
  }
  if (runtime.localMatrix === null) runtime.localMatrix = createMatrix();
  const matrix = runtime.localMatrix;
  if (target.skewX === 0 && target.skewY === 0) {
    matrix.a = runtime.rotationCosine * target.scaleX;
    matrix.b = runtime.rotationSine * target.scaleX;
    matrix.c = -runtime.rotationSine * target.scaleY;
    matrix.d = runtime.rotationCosine * target.scaleY;
  } else {
    const radY = (runtime.rotationAngle + target.skewY) * DEG_TO_RAD;
    const radX = (runtime.rotationAngle + target.skewX) * DEG_TO_RAD;
    matrix.a = Math.cos(radY) * target.scaleX;
    matrix.b = Math.sin(radY) * target.scaleX;
    matrix.c = -Math.sin(radX) * target.scaleY;
    matrix.d = Math.cos(radX) * target.scaleY;
  }
  // Pivot: the local point (pivotX, pivotY) maps to (x, y). With pivot 0,0 this reduces to tx=x, ty=y.
  matrix.tx = target.x - (matrix.a * target.pivotX + matrix.c * target.pivotY);
  matrix.ty = target.y - (matrix.b * target.pivotX + matrix.d * target.pivotY);
  runtime.localTransformUsingLocalTransformId = runtime.localTransformId;
}

function recomputeWorldTransform2D<Traits extends object>(
  target: Transform2DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasTransform2DRuntime,
  parentRuntime?: Readonly<NodeRuntime<Traits> & HasTransform2DRuntime>,
): void {
  if (runtime.worldMatrix === null) runtime.worldMatrix = createMatrix();
  ensureNodeLocalMatrix(target);
  if (parentRuntime !== undefined) {
    multiplyMatrix(runtime.worldMatrix, parentRuntime.worldMatrix!, runtime.localMatrix!);
  } else {
    copyMatrix(runtime.worldMatrix, runtime.localMatrix!);
  }
  computeNodeWorldTransformRevision(runtime, parentRuntime);
}

const DEG_TO_RAD = Math.PI / 180;
