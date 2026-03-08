import { matrix3x2 } from '@flighthq/geometry';
import { getRuntime } from '@flighthq/scene-graph-core';
import type { Matrix3x2, SceneNode, Transform2D, Transform2DRuntime, Vector2 } from '@flighthq/types';

export function ensureLocalTransform<K extends symbol>(target: SceneNode<K> & Transform2D): void {
  const state = getRuntime(target) as Transform2DRuntime<K>;
  if (state.localTransformUsingLocalTransformID !== state.localTransformID) {
    recomputeLocalTransform(target, state);
  }
}

export function ensureWorldTransform<K extends symbol>(target: SceneNode<K> & Transform2D): void {
  const state = getRuntime(target) as Transform2DRuntime<K>;
  const parent = target.parent;

  let parentState: Transform2DRuntime<K> | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransform(parent as SceneNode<K> & Transform2D);
    parentState = getRuntime(parent) as Transform2DRuntime<K>;
    parentWorldTransformID = parentState.worldTransformID;
  }

  if (
    state.worldTransformUsingLocalTransformID !== state.localTransformID ||
    state.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform(target, state, parentState);
  }
}

export function getLocalTransform<K extends symbol>(target: SceneNode<K> & Transform2D): Readonly<Matrix3x2> {
  ensureLocalTransform(target);
  return (getRuntime(target) as Transform2DRuntime<K>).localTransform!;
}

export function getWorldTransform<K extends symbol>(target: SceneNode<K> & Transform2D): Readonly<Matrix3x2> {
  ensureWorldTransform(target);
  return (getRuntime(target) as Transform2DRuntime<K>).worldTransform!;
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal<K extends symbol>(
  out: Vector2,
  source: SceneNode<K> & Transform2D,
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
  source: SceneNode<K> & Transform2D,
  point: Readonly<Vector2>,
): void {
  matrix3x2.transformPointXY(out, getWorldTransform(source), point.x, point.y);
}

function recomputeLocalTransform<K extends symbol>(
  target: SceneNode<K> & Transform2D,
  state: Transform2DRuntime<K>,
): void {
  if (target.rotation !== state.rotationAngle) {
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

    state.rotationAngle = angle;
    state.rotationSine = sin;
    state.rotationCosine = cos;
  }

  if (state.localTransform === null) state.localTransform = matrix3x2.create();
  const matrix = state.localTransform;
  matrix.a = state.rotationCosine * target.scaleX;
  matrix.b = state.rotationSine * target.scaleX;
  matrix.c = -state.rotationSine * target.scaleY;
  matrix.d = state.rotationCosine * target.scaleY;
  matrix.tx = target.x;
  matrix.ty = target.y;

  state.localTransformUsingLocalTransformID = state.localTransformID;
}

function recomputeWorldTransform<K extends symbol>(
  target: SceneNode<K> & Transform2D,
  state: Transform2DRuntime<K>,
  parentState?: Transform2DRuntime<K>,
): void {
  if (state.worldTransform === null) state.worldTransform = matrix3x2.create();
  ensureLocalTransform(target);
  if (parentState !== undefined) {
    matrix3x2.multiply(state.worldTransform, parentState.worldTransform!, state.localTransform!);
  } else {
    matrix3x2.copy(state.worldTransform, state.localTransform!);
  }
  recomputeWorldTransformID(state, parentState);
}

function recomputeWorldTransformID<K extends symbol>(
  state: Transform2DRuntime<K>,
  parentState?: Transform2DRuntime<K>,
): void {
  const localTransformID = state.localTransformID;
  const parentWorldTransformID = parentState ? parentState.worldTransformID : 0;
  state.worldTransformUsingLocalTransformID = localTransformID;
  state.worldTransformUsingParentTransformID = parentWorldTransformID;
  state.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
