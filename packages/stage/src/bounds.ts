import { matrix3x2, matrix3x2Pool, rectangle } from '@flighthq/math';
import type { BitmapData, DisplayObject, Rectangle } from '@flighthq/types';
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
  ensureWorldTransform(target);
  ensureLocalBoundsRect(target);
  const state = getGraphState(target);
  if (
    state.worldBoundsRectUsingWorldTransformID !== state.worldTransformID ||
    state.worldBoundsRectUsingLocalBoundsID !== state.localBoundsID
  ) {
    recomputeWorldBoundsRect(target, state);
  }
}

export function getBoundsRect(target: DisplayObject): Readonly<Rectangle> {
  ensureBoundsRect(target);
  return getGraphState(target).boundsRect!;
}

export function getLocalBoundsRect(target: DisplayObject): Readonly<Rectangle> {
  ensureLocalBoundsRect(target);
  return getGraphState(target).localBoundsRect!;
}

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
