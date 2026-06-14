import type { Node, NodeRuntime } from '@flighthq/types';

import { getNodeRuntime } from './node';

export function computeNodeWorldTransformRevision<Kind extends symbol, Traits extends object>(
  runtime: NodeRuntime<Kind, Traits>,
  parentRuntime?: Readonly<NodeRuntime<Kind, Traits>>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}

export function getNodeAppearanceRevision<Kind extends symbol, Traits extends object>(
  source: Readonly<Node<Kind, Traits>>,
): number {
  return getNodeRuntime(source).appearanceID;
}

export function getNodeLocalBoundsRevision<Kind extends symbol, Traits extends object>(
  source: Readonly<Node<Kind, Traits>>,
): number {
  return getNodeRuntime(source).localBoundsID;
}

export function getNodeLocalTransformRevision<Kind extends symbol, Traits extends object>(
  source: Readonly<Node<Kind, Traits>>,
): number {
  return getNodeRuntime(source).localTransformID;
}

export function getNodeWorldTransformRevision<Kind extends symbol, Traits extends object>(
  source: Node<Kind, Traits>,
): number {
  return getNodeRuntime(source).worldTransformID;
}

export function invalidateNode<Kind extends symbol, Traits extends object>(target: Node<Kind, Traits>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalBounds(target);
  invalidateNodeLocalTransform(target);
  invalidateNodeParentReference(target);
  invalidateNodeWorldBounds(target);
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateNodeAppearance<Kind extends symbol, Traits extends object>(target: Node<Kind, Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Kind, Traits>;
  runtime.appearanceID = (runtime.appearanceID + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateNodeLocalBounds<Kind extends symbol, Traits extends object>(
  target: Node<Kind, Traits>,
): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Kind, Traits>;
  runtime.localBoundsID = (runtime.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateNodeLocalTransform<Kind extends symbol, Traits extends object>(
  target: Node<Kind, Traits>,
): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Kind, Traits>;
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateNodeParentReference<Kind extends symbol, Traits extends object>(
  target: Node<Kind, Traits>,
): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Kind, Traits>;
  runtime.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's visual output changed (appearance or local transform).
 * Use this when animating properties like alpha, x, y, scaleX, scaleY, rotation.
 */
export function invalidateNodeRender<Kind extends symbol, Traits extends object>(target: Node<Kind, Traits>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalTransform(target);
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateNodeWorldBounds<Kind extends symbol, Traits extends object>(
  target: Node<Kind, Traits>,
): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Kind, Traits>;
  runtime.worldBoundsUsingWorldTransformID = -1;
  runtime.worldBoundsUsingLocalBoundsID = -1;
}
