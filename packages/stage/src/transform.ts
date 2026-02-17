import { matrix3x2 } from '@flighthq/math';
import type { DisplayObject, GraphState, Matrix3x2, Vector2 } from '@flighthq/types';

import { getGraphState } from './internal/graphState';

export function ensureLocalTransform(target: DisplayObject): void {
  const state = getGraphState(target);
  if (state.localTransformUsingLocalTransformID !== state.localTransformID) {
    recomputeLocalTransform(target, state);
  }
}

export function ensureWorldTransform(target: DisplayObject): void {
  const state = getGraphState(target);
  const parent = target.parent;

  let parentState: GraphState | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldTransform(parent);
    parentState = getGraphState(parent);
    parentWorldTransformID = parentState.worldTransformID;
  }

  if (
    state.worldTransformID !== state.localTransformID ||
    state.worldTransformUsingParentID !== parentWorldTransformID
  ) {
    recomputeWorldTransform(target, state, parentState);
  }
}

export function getLocalTransform(target: DisplayObject): Readonly<Matrix3x2> {
  ensureLocalTransform(target);
  return getGraphState(target).localTransform!;
}

export function getWorldTransform(target: DisplayObject): Readonly<Matrix3x2> {
  ensureWorldTransform(target);
  return getGraphState(target).worldTransform!;
}

/**
 * Converts the `point` object from the Stage (global) coordinates
 * to the display object's (local) coordinates.
 **/
export function globalToLocal(out: Vector2, source: DisplayObject, pos: Readonly<Vector2>): void {
  matrix3x2.inverseTransformPointXY(out, getWorldTransform(source), pos.x, pos.y);
}

/**
 * Converts the `point` object from the display object's (local)
 * coordinates to world coordinates.
 **/
export function localToGlobal(out: Vector2, source: DisplayObject, point: Readonly<Vector2>): void {
  matrix3x2.transformPointXY(out, getWorldTransform(source), point.x, point.y);
}

function recomputeLocalTransform(target: DisplayObject, state: GraphState): void {
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

function recomputeWorldTransform(target: DisplayObject, state: GraphState, parentState?: GraphState): void {
  if (state.worldTransform === null) state.worldTransform = matrix3x2.create();
  ensureLocalTransform(target);
  if (parentState !== undefined) {
    matrix3x2.multiply(state.worldTransform, parentState.worldTransform!, state.localTransform!);
    state.worldTransformUsingParentID = parentState.worldTransformID;
  } else {
    matrix3x2.copy(state.worldTransform, state.localTransform!);
  }
  state.worldTransformID = state.localTransformID;
}
