import type { DisplayObject } from '@flighthq/types';

import { getDerivedState } from './internal/derivedState';

export function invalidate(target: DisplayObject): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
}

export function invalidateAppearance(target: DisplayObject): void {
  getDerivedState(target).appearanceID++;
}

export function invalidateLocalBounds(target: DisplayObject): void {
  getDerivedState(target).localBoundsID++;
}

export function invalidateLocalTransform(target: DisplayObject): void {
  getDerivedState(target).localTransformID++;
}

export function invalidateWorldBounds(target: DisplayObject): void {
  const state = getDerivedState(target);
  state.worldBoundsRectUsingWorldTransformID = -1;
  state.worldBoundsRectUsingLocalBoundsID = -1;
}
