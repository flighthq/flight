import type { DisplayObject } from '@flighthq/types';

import { getDerivedState } from './internal/derivedState';

export function getAppearanceID(target: DisplayObject): number {
  return getDerivedState(target).appearanceID;
}

export function getLocalBoundsID(target: DisplayObject): number {
  return getDerivedState(target).localBoundsID;
}

export function getLocalTransformID(target: DisplayObject): number {
  return getDerivedState(target).localTransformID;
}

export function getWorldBoundsID(target: DisplayObject): number {
  return getDerivedState(target).worldBoundsRectUsingWorldTransformID;
}

export function getWorldTransformID(target: DisplayObject): number {
  return getDerivedState(target).worldTransformID;
}
