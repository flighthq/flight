import type { DisplayObject } from '@flighthq/types';

import { getDisplayObjectState } from './internal/displayObjectState';

export function getAppearanceID(target: DisplayObject): number {
  return getDisplayObjectState(target).appearanceID;
}

export function getLocalBoundsID(target: DisplayObject): number {
  return getDisplayObjectState(target).localBoundsID;
}

export function getLocalTransformID(target: DisplayObject): number {
  return getDisplayObjectState(target).localTransformID;
}

export function getWorldBoundsID(target: DisplayObject): number {
  return getDisplayObjectState(target).worldBoundsRectUsingWorldTransformID;
}

export function getWorldTransformID(target: DisplayObject): number {
  return getDisplayObjectState(target).worldTransformID;
}

export function invalidate(target: DisplayObject): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
}

export function invalidateAppearance(target: DisplayObject): void {
  getDisplayObjectState(target).appearanceID++;
}

export function invalidateLocalBounds(target: DisplayObject): void {
  getDisplayObjectState(target).localBoundsID++;
}

export function invalidateLocalTransform(target: DisplayObject): void {
  getDisplayObjectState(target).localTransformID++;
}

export function invalidateWorldBounds(target: DisplayObject): void {
  const state = getDisplayObjectState(target);
  state.worldBoundsRectUsingWorldTransformID = -1;
  state.worldBoundsRectUsingLocalBoundsID = -1;
}
