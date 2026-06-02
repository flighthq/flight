import type { SceneNode, SceneNodeRuntime } from '@flighthq/types';

import { getSceneNodeRuntime } from './sceneNode';

export function getAppearanceRevision<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
): number {
  return getSceneNodeRuntime(source).appearanceID;
}

export function getLocalBoundsRevision<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
): number {
  return getSceneNodeRuntime(source).localBoundsID;
}

export function getLocalTransformRevision<SceneKind extends symbol, Traits extends object>(
  source: Readonly<SceneNode<SceneKind, Traits>>,
): number {
  return getSceneNodeRuntime(source).localTransformID;
}

export function getWorldTransformRevision<SceneKind extends symbol, Traits extends object>(
  source: SceneNode<SceneKind, Traits>,
): number {
  return getSceneNodeRuntime(source).worldTransformID;
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateAppearance<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  const runtime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
  runtime.appearanceID = (runtime.appearanceID + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateLocalBounds<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  const runtime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
  runtime.localBoundsID = (runtime.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  const runtime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateParentReference<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  const runtime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
  runtime.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's visual output changed (appearance or local transform).
 * Use this when animating properties like alpha, x, y, scaleX, scaleY, rotation.
 */
export function invalidateRender<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  invalidateAppearance(target);
  invalidateLocalTransform(target);
}

export function invalidateSceneNode<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
  invalidateParentReference(target);
  invalidateWorldBounds(target);
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateWorldBounds<SceneKind extends symbol, Traits extends object>(
  target: SceneNode<SceneKind, Traits>,
): void {
  const runtime = getSceneNodeRuntime(target) as SceneNodeRuntime<SceneKind, Traits>;
  runtime.worldBoundsUsingWorldTransformID = -1;
  runtime.worldBoundsUsingLocalBoundsID = -1;
}

export function recomputeWorldTransformRevision<SceneKind extends symbol, Traits extends object>(
  runtime: SceneNodeRuntime<SceneKind, Traits>,
  parentRuntime?: Readonly<SceneNodeRuntime<SceneKind, Traits>>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
