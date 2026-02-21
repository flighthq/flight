import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/math';
import type { BitmapData, DisplayObject, Matrix3x2, Rectangle } from '@flighthq/types';
import type { GraphState } from '@flighthq/types';

import { getGraphState } from './internal/graphState';
import { ensureWorldTransform, getLocalTransform, getWorldTransform } from './transform';

/**
 * Writes a rectangle which defines the area of the display object
 * relative to the coordinate system of the `targetCoordinateSpace` object.
 **/
export function calculateBoundsRect(
  out: Rectangle,
  source: DisplayObject,
  targetCoordinateSpace: DisplayObject | null | undefined,
): void {
  const localBounds = getLocalBoundsRect(source);
  // Fast paths
  if (!targetCoordinateSpace || targetCoordinateSpace === source) {
    // localBounds
    rectangle.copy(out, localBounds);
  } else if (targetCoordinateSpace === source.parent) {
    // bounds (parent coordinate space)
    rectangle.copy(out, getBoundsRect(source));
  } else {
    // TODO: fast path for root/stage coordinate space?
    const transform = matrix3x2Pool.get();
    matrix3x2.inverse(transform, getWorldTransform(targetCoordinateSpace));
    matrix3x2.multiply(transform, transform, getWorldTransform(source));
    matrix3x2.transformRect(out, transform, localBounds);
    matrix3x2Pool.release(transform);
  }
}

export function ensureBoundsRect(target: DisplayObject): void {
  const state = getGraphState(target);
  if (
    state.boundsRectUsingLocalBoundsID !== state.localBoundsID ||
    state.boundsRectUsingLocalTransformID !== state.localTransformID
  ) {
    recomputeBoundsRect(target, state);
  }
}

export function ensureLocalBoundsRect(target: DisplayObject): void {
  const state = getGraphState(target);
  if (state.localBoundsRectUsingLocalBoundsID !== state.localBoundsID) {
    recomputeLocalBoundsRect(target, state);
  }
}

export function ensureWorldBoundsRect(target: DisplayObject): void {
  const state = getGraphState(target);
  const localBoundsInvalid = state.worldBoundsRectUsingLocalBoundsID !== state.localBoundsID;
  const hasChildren = target.children !== null;
  let forceRecompute = false;
  if (!hasChildren && !localBoundsInvalid) {
    if (tryFastRecomputeWorldBoundsRect(target, state)) return;
    forceRecompute = true;
  }
  ensureWorldTransform(target);
  if (forceRecompute || localBoundsInvalid || state.worldBoundsRectUsingWorldTransformID !== state.worldTransformID) {
    recomputeWorldBoundsRect(target, state);
  }
}

/**
 * localBoundsRect * localTransform
 */
export function getBoundsRect(target: DisplayObject): Readonly<Rectangle> {
  ensureBoundsRect(target);
  return getGraphState(target).boundsRect!;
}

/**
 * Object's own bounds (not including children)
 */
export function getLocalBoundsRect(target: DisplayObject): Readonly<Rectangle> {
  ensureLocalBoundsRect(target);
  return getGraphState(target).localBoundsRect!;
}

/**
 * Object's bounds in world space (including children)
 */
export function getWorldBoundsRect(target: DisplayObject): Readonly<Rectangle> {
  ensureWorldBoundsRect(target);
  return getGraphState(target).worldBoundsRect!;
}

function recomputeBoundsRect(target: DisplayObject, state: GraphState): void {
  if (state.boundsRect === null) state.boundsRect = rectangle.create();
  matrix3x2.transformRect(state.boundsRect, getLocalTransform(target), getLocalBoundsRect(target));
  state.boundsRectUsingLocalBoundsID = state.localBoundsID;
  state.boundsRectUsingLocalTransformID = state.localTransformID;
}

function recomputeLocalBoundsRect(target: DisplayObject, state: GraphState): void {
  if (state.localBoundsRect === null) state.localBoundsRect = rectangle.create();
  switch (target.type) {
    case 'bitmap':
      const bitmapData: BitmapData = target.data as BitmapData;
      if (bitmapData.image) {
        state.localBoundsRect.width = bitmapData.image.width;
        state.localBoundsRect.height = bitmapData.image.height;
      }
      break;
    case 'container': // local bounds are empty, child bounds are in worldBoundsRect
    default:
      rectangle.setEmpty(state.localBoundsRect);
      break;
  }
  state.localBoundsRectUsingLocalBoundsID = state.localBoundsID;
}

function recomputeWorldBoundsRect(target: DisplayObject, state: GraphState) {
  if (state.worldBoundsRect === null) state.worldBoundsRect = rectangle.create();
  matrix3x2.transformRect(state.worldBoundsRect, getWorldTransform(target), getLocalBoundsRect(target));
  if (target.children !== null) {
    for (const child of target.children) {
      const childWorldBounds = getWorldBoundsRect(child);
      rectangle.union(state.worldBoundsRect, state.worldBoundsRect, childWorldBounds);
    }
  }
  state.worldBoundsRectUsingWorldTransformID = state.worldTransformID;
  state.worldBoundsRectUsingLocalBoundsID = state.localBoundsID;
}

function tryFastRecomputeWorldBoundsRect(target: DisplayObject, state: GraphState): boolean {
  if (state.worldBoundsRect !== null && state.worldTransform !== null) {
    const { a: _a, b: _b, c: _c, d: _d, tx: _tx, ty: _ty } = state.worldTransform;
    ensureWorldTransform(target);
    const { a, b, c, d, tx, ty } = state.worldTransform;
    // check for unchanged rotation and scale
    if (a === _a && b === _b && c === _c && d === _d) {
      // offset only
      if (tx !== _tx || ty !== _ty) {
        state.worldBoundsRect.x += tx - _tx;
        state.worldBoundsRect.y += ty - _ty;
      }
      return true;
    }
  }
  return false;
}
