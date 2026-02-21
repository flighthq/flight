import type { DisplayObject } from '@flighthq/types';

import { getGraphState } from './internal/graphState';

export function getAppearanceID(target: DisplayObject): number {
  return getGraphState(target).appearanceID;
}

export function getLocalBoundsID(target: DisplayObject): number {
  return getGraphState(target).localBoundsID;
}

export function getLocalTransformID(target: DisplayObject): number {
  return getGraphState(target).localTransformID;
}

export function getWorldTransformID(target: DisplayObject): number {
  return getGraphState(target).worldTransformID;
}

export function invalidate(target: DisplayObject): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateAppearance(target: DisplayObject): void {
  getGraphState(target).appearanceID++;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateLocalBounds(target: DisplayObject): void {
  getGraphState(target).localBoundsID++;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform(target: DisplayObject): void {
  getGraphState(target).localTransformID++;
}

/**
 * Target object's parent changed.
 */
export function invalidateParentCache(target: DisplayObject): void {
  const state = getGraphState(target);
  state.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateWorldBounds(target: DisplayObject): void {
  const state = getGraphState(target);
  state.worldBoundsRectUsingWorldTransformID = -1;
  state.worldBoundsRectUsingLocalBoundsID = -1;
}
