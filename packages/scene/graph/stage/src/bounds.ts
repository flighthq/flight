import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/geometry';
import type { GraphState } from '@flighthq/types';
import { type BitmapData, BitmapKind, type DisplayObject, DisplayObjectKind, type Rectangle } from '@flighthq/types';

import { getGraphState } from './graphState';
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
  if (!targetCoordinateSpace) targetCoordinateSpace = source;
  let bounds;
  if (targetCoordinateSpace.parent === null) {
    // if target has no parent, use world bounds
    bounds = getWorldBoundsRect(source);
  } else if (source.children === null || source.children.length === 0) {
    // only world bounds considers children
    if (targetCoordinateSpace === source) {
      // fast path, return local bounds for self
      bounds = getLocalBoundsRect(source);
    } else if (targetCoordinateSpace === source.parent) {
      // fast path, return bounds for parent
      bounds = getBoundsRect(source);
    }
  }
  if (!bounds) {
    // translate world bounds into target coordinate space
    const worldBounds = getWorldBoundsRect(source);
    const transform = matrix3x2Pool.get();
    matrix3x2.inverse(transform, getWorldTransform(targetCoordinateSpace));
    matrix3x2.transformRect(out, transform, worldBounds);
    matrix3x2Pool.release(transform);
  } else {
    rectangle.copy(out, bounds);
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
  switch (target.kind) {
    case BitmapKind:
      const bitmapData: BitmapData = target.data as BitmapData;
      if (bitmapData.image) {
        state.localBoundsRect.width = bitmapData.image.width;
        state.localBoundsRect.height = bitmapData.image.height;
      }
      break;
    case DisplayObjectKind: // local bounds are empty, child bounds are in worldBoundsRect
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
      if (childWorldBounds.width !== 0 && childWorldBounds.height !== 0) {
        rectangle.union(state.worldBoundsRect, state.worldBoundsRect, childWorldBounds);
      }
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
