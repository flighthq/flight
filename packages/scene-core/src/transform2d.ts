import { getEntityRuntime } from '@flighthq/entity';
import {
  copyMatrix,
  createMatrix,
  inverseMatrixTransformPointXY,
  matrixTransformPointXY,
  multiplyMatrix,
} from '@flighthq/geometry';
import { invalidateLocalTransform, recomputeWorldTransformRevision } from '@flighthq/scene-core';
import type {
  GraphTransform2DNode,
  HasTransform2DRuntime,
  Matrix,
  SceneNodeRuntime,
  Vector2Like,
} from '@flighthq/types';

export function ensureLocalTransformMatrix<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime;
  if (runtime.localTransformUsingLocalTransformID !== runtime.localTransformID) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureWorldTransformMatrix<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime;
  const parent = runtime.parent as GraphTransform2DNode<SceneKind, Traits>;

  let parentRuntime: (SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime) | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransformMatrix(parent);
    parentRuntime = getEntityRuntime(parent) as SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform2D(target, runtime, parentRuntime);
  }
}

export function getLocalTransformMatrix<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
): Readonly<Matrix> {
  ensureLocalTransformMatrix(target);
  return (getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime).localTransform2D!;
}

export function getWorldTransformMatrix<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
): Readonly<Matrix> {
  ensureWorldTransformMatrix(target);
  return (getEntityRuntime(target) as SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime).worldTransform2D!;
}

/**
 * Converts the `vector` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function sceneGlobalToLocalVector2<SceneKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphTransform2DNode<SceneKind, Traits>,
  vector: Readonly<Vector2Like>,
): void {
  inverseMatrixTransformPointXY(out, getWorldTransformMatrix(source), vector.x, vector.y);
}

/**
 * Converts the `vector` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function sceneLocalToGlobalVector2<SceneKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphTransform2DNode<SceneKind, Traits>,
  vector: Readonly<Vector2Like>,
): void {
  matrixTransformPointXY(out, getWorldTransformMatrix(source), vector.x, vector.y);
}

function recomputeLocalTransform2D<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  runtime: SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime,
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

function recomputeWorldTransform2D<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  runtime: SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime,
  parentRuntime?: Readonly<SceneNodeRuntime<SceneKind, Traits> & HasTransform2DRuntime>,
): void {
  if (runtime.worldTransform2D === null) runtime.worldTransform2D = createMatrix();
  ensureLocalTransformMatrix(target);
  if (parentRuntime !== undefined) {
    multiplyMatrix(runtime.worldTransform2D, parentRuntime.worldTransform2D!, runtime.localTransform2D!);
  } else {
    copyMatrix(runtime.worldTransform2D, runtime.localTransform2D!);
  }
  recomputeWorldTransformRevision(runtime, parentRuntime);
}

export function setTransformRotation<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  value: number,
): void {
  target.rotation = value;
  invalidateLocalTransform(target);
}

export function setTransformScaleX<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  value: number,
): void {
  target.scaleX = value;
  invalidateLocalTransform(target);
}

export function setTransformScaleY<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  value: number,
): void {
  target.scaleY = value;
  invalidateLocalTransform(target);
}

export function setTransformX<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  value: number,
): void {
  target.x = value;
  invalidateLocalTransform(target);
}

export function setTransformY<SceneKind extends symbol, Traits extends object>(
  target: GraphTransform2DNode<SceneKind, Traits>,
  value: number,
): void {
  target.y = value;
  invalidateLocalTransform(target);
}

const DEG_TO_RAD = Math.PI / 180;
