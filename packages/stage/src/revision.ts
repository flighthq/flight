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

export function getWorldBoundsID(target: DisplayObject): number {
  return getGraphState(target).worldBoundsRectUsingWorldTransformID;
}

export function getWorldTransformID(target: DisplayObject): number {
  return getGraphState(target).worldTransformID;
}

export function invalidate(target: DisplayObject): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
}

export function invalidateAppearance(target: DisplayObject): void {
  getGraphState(target).appearanceID++;
}

export function invalidateLocalBounds(target: DisplayObject): void {
  getGraphState(target).localBoundsID++;
}

export function invalidateLocalTransform(target: DisplayObject): void {
  getGraphState(target).localTransformID++;
}

export function invalidateWorldBounds(target: DisplayObject): void {
  const state = getGraphState(target);
  state.worldBoundsRectUsingWorldTransformID = -1;
  state.worldBoundsRectUsingLocalBoundsID = -1;
}
