import { getEntityRuntime } from '@flighthq/entity';
import {
  copyMatrix,
  createMatrix,
  inverseMatrixTransformPointXY,
  matrixTransformPointXY,
  multiplyMatrix,
} from '@flighthq/geometry';
import { invalidateLocalTransform, recomputeWorldTransformID } from '@flighthq/scenegraph-core';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Matrix,
  Vector2Like,
} from '@flighthq/types';

export function ensureLocalTransformMatrix<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): void {
  const runtime = getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
  if (runtime.localTransformUsingLocalTransformID !== runtime.localTransformID) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureWorldTransformMatrix<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): void {
  const runtime = getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
  const parent = runtime.parent as GraphNode<GraphKind, Traits> & HasTransform2D;

  let parentRuntime: (GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime) | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransformMatrix(parent);
    parentRuntime = getEntityRuntime(parent) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform2D(target, runtime, parentRuntime);
  }
}

export function getLocalTransformMatrix<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): Readonly<Matrix> {
  ensureLocalTransformMatrix(target);
  return (getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime).localTransform2D!;
}

export function getWorldTransformMatrix<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): Readonly<Matrix> {
  ensureWorldTransformMatrix(target);
  return (getEntityRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime).worldTransform2D!;
}

/**
 * Converts the `vector` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalVector2ToLocal<GraphKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  vector: Readonly<Vector2Like>,
): void {
  inverseMatrixTransformPointXY(out, getWorldTransformMatrix(source), vector.x, vector.y);
}

/**
 * Converts the `vector` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localVector2ToGlobal<GraphKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  vector: Readonly<Vector2Like>,
): void {
  matrixTransformPointXY(out, getWorldTransformMatrix(source), vector.x, vector.y);
}

function recomputeLocalTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime,
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
  matrix.tx = target.x;
  matrix.ty = target.y;
  runtime.localTransformUsingLocalTransformID = runtime.localTransformID;
}

function recomputeWorldTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
  runtime: GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime,
  parentRuntime?: Readonly<GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime>,
): void {
  if (runtime.worldTransform2D === null) runtime.worldTransform2D = createMatrix();
  ensureLocalTransformMatrix(target);
  if (parentRuntime !== undefined) {
    multiplyMatrix(runtime.worldTransform2D, parentRuntime.worldTransform2D!, runtime.localTransform2D!);
  } else {
    copyMatrix(runtime.worldTransform2D, runtime.localTransform2D!);
  }
  recomputeWorldTransformID(runtime, parentRuntime);
}

export function setTransformRotation<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  value: number,
): void {
  source.rotation = value;
  invalidateLocalTransform(source);
}

export function setTransformScaleX<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  value: number,
): void {
  source.scaleX = value;
  invalidateLocalTransform(source);
}

export function setTransformScaleY<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  value: number,
): void {
  source.scaleY = value;
  invalidateLocalTransform(source);
}

export function setTransformX<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  value: number,
): void {
  source.x = value;
  invalidateLocalTransform(source);
}

export function setTransformY<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  value: number,
): void {
  source.y = value;
  invalidateLocalTransform(source);
}

const DEG_TO_RAD = Math.PI / 180;
