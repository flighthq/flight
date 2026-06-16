import type { Node, NodeRuntime } from '@flighthq/types';

import { getNodeRuntime } from './node';

export function computeNodeWorldTransformRevision<Traits extends object>(
  runtime: NodeRuntime<Traits>,
  parentRuntime?: Readonly<NodeRuntime<Traits>>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}

export function getNodeAppearanceRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).appearanceID;
}

export function getNodeLocalBoundsRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).localBoundsID;
}

export function getNodeLocalTransformRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).localTransformID;
}

export function getNodeWorldTransformRevision<Traits extends object>(source: Node<Traits>): number {
  return getNodeRuntime(source).worldTransformID;
}

export function invalidateNode<Traits extends object>(target: Node<Traits>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalBounds(target);
  invalidateNodeLocalTransform(target);
  invalidateNodeParentReference(target);
  invalidateNodeWorldBounds(target);
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateNodeAppearance<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.appearanceID = (runtime.appearanceID + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateNodeLocalBounds<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.localBoundsID = (runtime.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateNodeLocalTransform<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateNodeParentReference<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's visual output changed (appearance or local transform).
 * Use this when animating properties like alpha, x, y, scaleX, scaleY, rotation.
 */
export function invalidateNodeRender<Traits extends object>(target: Node<Traits>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalTransform(target);
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateNodeWorldBounds<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.worldBoundsUsingWorldTransformID = -1;
  runtime.worldBoundsUsingLocalBoundsID = -1;
}
