import { getRuntime } from '@flighthq/scene-graph-core';
import type { SceneNode, Transform2D, Transform2DRuntime } from '@flighthq/types';

export function getLocalTransformID<K extends symbol>(target: SceneNode<K> & Transform2D): number {
  return getRuntime(target).localTransformID;
}

export function getWorldTransformID<K extends symbol>(target: SceneNode<K> & Transform2D): number {
  return (getRuntime(target) as Transform2DRuntime<K>).worldTransformID;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform<K extends symbol>(target: SceneNode<K> & Transform2D): void {
  const state = getRuntime(target);
  state.localTransformID = (state.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateWorldTransformParent<K extends symbol>(target: SceneNode<K> & Transform2D): void {
  const state = getRuntime(target) as Transform2DRuntime<K>;
  state.worldTransformUsingParentTransformID = -1;
}
