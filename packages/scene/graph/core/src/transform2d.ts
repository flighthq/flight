import { matrix3x2 } from '@flighthq/geometry';
import { getRuntime } from '@flighthq/scene-graph-core';
import type { HasTransform2D, Matrix3x2, SceneNode, Transform2DRuntime, Vector2 } from '@flighthq/types';

export function ensureLocalTransform<K extends symbol>(target: SceneNode<K> & HasTransform2D<K>): void {
  const runtime = getRuntime(target) as Transform2DRuntime<K>;
  if (runtime.localTransformUsingLocalTransformID !== runtime.localTransformID) {
    recomputeLocalTransform(target, runtime);
  }
}

export function ensureWorldTransform<K extends symbol>(target: SceneNode<K> & HasTransform2D<K>): void {
  const runtime = getRuntime(target) as Transform2DRuntime<K>;
  const parent = target.parent;

  let parentRuntime: Transform2DRuntime<K> | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransform(parent as SceneNode<K> & HasTransform2D<K>);
    parentRuntime = getRuntime(parent) as Transform2DRuntime<K>;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform(target, runtime, parentRuntime);
  }
}

export function getLocalTransform<K extends symbol>(target: SceneNode<K> & HasTransform2D<K>): Readonly<Matrix3x2> {
  ensureLocalTransform(target);
  return (getRuntime(target) as Transform2DRuntime<K>).localTransform!;
}

export function getWorldTransform<K extends symbol>(target: SceneNode<K> & HasTransform2D<K>): Readonly<Matrix3x2> {
  ensureWorldTransform(target);
  return (getRuntime(target) as Transform2DRuntime<K>).worldTransform!;
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal<K extends symbol>(
  out: Vector2,
  source: SceneNode<K> & HasTransform2D<K>,
  pos: Readonly<Vector2>,
): void {
  matrix3x2.inverseTransformPointXY(out, getWorldTransform(source), pos.x, pos.y);
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal<K extends symbol>(
  out: Vector2,
  source: SceneNode<K> & HasTransform2D<K>,
  point: Readonly<Vector2>,
): void {
  matrix3x2.transformPointXY(out, getWorldTransform(source), point.x, point.y);
}

function recomputeLocalTransform<K extends symbol>(
  target: SceneNode<K> & HasTransform2D<K>,
  runtime: Transform2DRuntime<K>,
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

  if (runtime.localTransform === null) runtime.localTransform = matrix3x2.create();
  const matrix = runtime.localTransform;
  matrix.a = runtime.rotationCosine * target.scaleX;
  matrix.b = runtime.rotationSine * target.scaleX;
  matrix.c = -runtime.rotationSine * target.scaleY;
  matrix.d = runtime.rotationCosine * target.scaleY;
  matrix.tx = target.x;
  matrix.ty = target.y;

  runtime.localTransformUsingLocalTransformID = runtime.localTransformID;
}

function recomputeWorldTransform<K extends symbol>(
  target: SceneNode<K> & HasTransform2D<K>,
  runtime: Transform2DRuntime<K>,
  parentRuntime?: Transform2DRuntime<K>,
): void {
  if (runtime.worldTransform === null) runtime.worldTransform = matrix3x2.create();
  ensureLocalTransform(target);
  if (parentRuntime !== undefined) {
    matrix3x2.multiply(runtime.worldTransform, parentRuntime.worldTransform!, runtime.localTransform!);
  } else {
    matrix3x2.copy(runtime.worldTransform, runtime.localTransform!);
  }
  recomputeWorldTransformID(runtime, parentRuntime);
}

function recomputeWorldTransformID<K extends symbol>(
  runtime: Transform2DRuntime<K>,
  parentRuntime?: Transform2DRuntime<K>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
