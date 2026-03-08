import { getRuntime } from '@flighthq/scene-graph-core';
import type { DisplayObject, DisplayObjectRuntime } from '@flighthq/types';

export function getAppearanceID(target: DisplayObject): number {
  return getRuntime(target).appearanceID;
}

export function getLocalBoundsID(target: DisplayObject): number {
  return (getRuntime(target) as DisplayObjectRuntime).localBoundsID;
}

export function getLocalTransformID(target: DisplayObject): number {
  return getRuntime(target).localTransformID;
}

export function getWorldTransformID(target: DisplayObject): number {
  return (getRuntime(target) as DisplayObjectRuntime).worldTransformID;
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
  const state = getRuntime(target);
  state.appearanceID = (state.appearanceID + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateLocalBounds(target: DisplayObject): void {
  const state = getRuntime(target) as DisplayObjectRuntime;
  state.localBoundsID = (state.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform(target: DisplayObject): void {
  const state = getRuntime(target);
  state.localTransformID = (state.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateParentCache(target: DisplayObject): void {
  const state = getRuntime(target) as DisplayObjectRuntime;
  state.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateWorldBounds(target: DisplayObject): void {
  const state = getRuntime(target) as DisplayObjectRuntime;
  state.worldBoundsRectUsingWorldTransformID = -1;
  state.worldBoundsRectUsingLocalBoundsID = -1;
}
