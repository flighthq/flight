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
  inverseMatrixTransformPointXY(out, getNodeWorldTransformMatrix(source), vector.x, vector.y);
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
  matrixTransformPointXY(out, getNodeWorldTransformMatrix(source), vector.x, vector.y);
}

export function ensureNodeLocalTransformMatrix<Traits extends object>(target: Transform2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime;
  if (runtime.localTransformUsingLocalTransformId !== runtime.localTransformId) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureNodeWorldTransformMatrix<Traits extends object>(target: Transform2DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime;
  const parent = runtime.parent as Transform2DNode<Traits>;

  let parentRuntime: (NodeRuntime<Traits> & HasTransform2DRuntime) | undefined;
  let parentWorldTransformId = 0;

  if (parent !== null) {
    ensureNodeWorldTransformMatrix(parent);
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

export function getNodeLocalTransformMatrix<Traits extends object>(target: Transform2DNode<Traits>): Readonly<Matrix> {
  ensureNodeLocalTransformMatrix(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime).localTransform2D!;
}

export function getNodeWorldTransformMatrix<Traits extends object>(target: Transform2DNode<Traits>): Readonly<Matrix> {
  ensureNodeWorldTransformMatrix(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform2DRuntime).worldTransform2D!;
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
  if (runtime.localTransform2D === null) runtime.localTransform2D = createMatrix();
  const matrix = runtime.localTransform2D;
  matrix.a = runtime.rotationCosine * target.scaleX;
  matrix.b = runtime.rotationSine * target.scaleX;
  matrix.c = -runtime.rotationSine * target.scaleY;
  matrix.d = runtime.rotationCosine * target.scaleY;
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
  if (runtime.worldTransform2D === null) runtime.worldTransform2D = createMatrix();
  ensureNodeLocalTransformMatrix(target);
  if (parentRuntime !== undefined) {
    multiplyMatrix(runtime.worldTransform2D, parentRuntime.worldTransform2D!, runtime.localTransform2D!);
  } else {
    copyMatrix(runtime.worldTransform2D, runtime.localTransform2D!);
  }
  computeNodeWorldTransformRevision(runtime, parentRuntime);
}

const DEG_TO_RAD = Math.PI / 180;
