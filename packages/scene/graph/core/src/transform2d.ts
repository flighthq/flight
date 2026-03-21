import { getRuntime } from '@flighthq/core';
import { matrix3x2 } from '@flighthq/geometry';
import { recomputeWorldTransformID } from '@flighthq/scene-graph-core';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Matrix3x2,
  Vector2Like,
} from '@flighthq/types';

export function ensureLocalTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
  if (runtime.localTransformUsingLocalTransformID !== runtime.localTransformID) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureWorldTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): void {
  const runtime = getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
  const parent = runtime.parent as GraphNode<GraphKind, Traits> & HasTransform2D;

  let parentRuntime: (GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime) | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransform2D(parent);
    parentRuntime = getRuntime(parent) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform2D(target, runtime, parentRuntime);
  }
}

export function getLocalTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): Readonly<Matrix3x2> {
  ensureLocalTransform2D(target);
  return (getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime).localTransform2D!;
}

export function getWorldTransform2D<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits> & HasTransform2D,
): Readonly<Matrix3x2> {
  ensureWorldTransform2D(target);
  return (getRuntime(target) as GraphNodeRuntime<GraphKind, Traits> & HasTransform2DRuntime).worldTransform2D!;
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal2D<GraphKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  pos: Readonly<Vector2Like>,
): void {
  matrix3x2.inverseTransformPointXY(out, getWorldTransform2D(source), pos.x, pos.y);
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal2D<GraphKind extends symbol, Traits extends object>(
  out: Vector2Like,
  source: GraphNode<GraphKind, Traits> & HasTransform2D,
  point: Readonly<Vector2Like>,
): void {
  matrix3x2.transformPointXY(out, getWorldTransform2D(source), point.x, point.y);
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
  if (runtime.localTransform2D === null) runtime.localTransform2D = matrix3x2.create();
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
  if (runtime.worldTransform2D === null) runtime.worldTransform2D = matrix3x2.create();
  ensureLocalTransform2D(target);
  if (parentRuntime !== undefined) {
    matrix3x2.multiply(runtime.worldTransform2D, parentRuntime.worldTransform2D!, runtime.localTransform2D!);
  } else {
    matrix3x2.copy(runtime.worldTransform2D, runtime.localTransform2D!);
  }
  recomputeWorldTransformID(runtime, parentRuntime);
}

const DEG_TO_RAD = Math.PI / 180;
