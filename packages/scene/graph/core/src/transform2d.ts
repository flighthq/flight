import { getNodeRuntime } from '@flighthq/core';
import { matrix3x2 } from '@flighthq/geometry';
import { recomputeWorldTransformID } from '@flighthq/scene-graph-core';
import type { GraphNode, HasTransform2D, HasTransform2DRuntime, Matrix3x2, Vector2 } from '@flighthq/types';

export function ensureLocalTransform2D<G extends symbol>(target: GraphNode<G> & HasTransform2D<G>): void {
  const runtime = getNodeRuntime(target) as HasTransform2DRuntime<G>;
  if (runtime.localTransformUsingLocalTransformID !== runtime.localTransformID) {
    recomputeLocalTransform2D(target, runtime);
  }
}

export function ensureWorldTransform2D<G extends symbol>(target: GraphNode<G> & HasTransform2D<G>): void {
  const runtime = getNodeRuntime(target) as HasTransform2DRuntime<G>;
  const parent = runtime.parent;

  let parentRuntime: HasTransform2DRuntime<G> | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransform2D(parent as GraphNode<G> & HasTransform2D<G>);
    parentRuntime = getNodeRuntime(parent) as HasTransform2DRuntime<G>;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform2D(target, runtime, parentRuntime);
  }
}

export function getLocalTransform2D<G extends symbol>(target: GraphNode<G> & HasTransform2D<G>): Readonly<Matrix3x2> {
  ensureLocalTransform2D(target);
  return (getNodeRuntime(target) as HasTransform2DRuntime<G>).localTransform2D!;
}

export function getWorldTransform2D<G extends symbol>(target: GraphNode<G> & HasTransform2D<G>): Readonly<Matrix3x2> {
  ensureWorldTransform2D(target);
  return (getNodeRuntime(target) as HasTransform2DRuntime<G>).worldTransform2D!;
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal2D<G extends symbol>(
  out: Vector2,
  source: GraphNode<G> & HasTransform2D<G>,
  pos: Readonly<Vector2>,
): void {
  matrix3x2.inverseTransformPointXY(out, getWorldTransform2D(source), pos.x, pos.y);
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal2D<G extends symbol>(
  out: Vector2,
  source: GraphNode<G> & HasTransform2D<G>,
  point: Readonly<Vector2>,
): void {
  matrix3x2.transformPointXY(out, getWorldTransform2D(source), point.x, point.y);
}

function recomputeLocalTransform2D<G extends symbol>(
  target: GraphNode<G> & HasTransform2D<G>,
  runtime: HasTransform2DRuntime<G>,
): void {
  if (target.rotation !== runtime.rotationAngle) {
    // Normalize from -180 to 180
    let angle = target.rotation % 360.0;
    if (angle > 180.0) {
      angle -= 360.0;
    } else if (angle < -180.0) {
      angle += 360.0;
    }

    // Use fast cardinal values, or lookup
    const DEG_TO_RAD = Math.PI / 180;
    let sin, cos;
    if (angle === 0) {
      sin = 0;
      cos = 1;
    } else if (angle === 90) {
      sin = 1;
      cos = 0;
    } else if (angle === -90) {
      sin = -1;
      cos = 0;
    } else if (angle === 180 || angle === -180) {
      sin = 0;
      cos = -1;
    } else {
      const rad = angle * DEG_TO_RAD;
      sin = Math.sin(rad);
      cos = Math.cos(rad);
    }

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

function recomputeWorldTransform2D<G extends symbol>(
  target: GraphNode<G> & HasTransform2D<G>,
  runtime: HasTransform2DRuntime<G>,
  parentRuntime?: Readonly<HasTransform2DRuntime<G>>,
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
