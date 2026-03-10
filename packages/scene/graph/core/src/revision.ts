import type { GraphNode, GraphNodeRuntime } from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';
import { getRuntime } from './node';

export function getAppearanceID<G extends symbol>(source: Readonly<GraphNode<G>>): number {
  return getGraphNodeRuntime(source).appearanceID;
}

export function getLocalBoundsID<G extends symbol>(source: Readonly<GraphNode<G>>): number {
  return getGraphNodeRuntime(source).localBoundsID;
}

export function getLocalTransformID<G extends symbol>(source: Readonly<GraphNode<G>>): number {
  return getGraphNodeRuntime(source).localTransformID;
}

export function getWorldTransformID<G extends symbol>(source: GraphNode<G>): number {
  return getGraphNodeRuntime(source).worldTransformID;
}

export function invalidate<G extends symbol>(target: GraphNode<G>): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
  invalidateParentReference(target);
  invalidateWorldBounds(target);
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateAppearance<G extends symbol>(target: GraphNode<G>): void {
  const runtime = getGraphNodeRuntime(target);
  runtime.appearanceID = (runtime.appearanceID + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateLocalBounds<G extends symbol>(target: GraphNode<G>): void {
  const runtime = getGraphNodeRuntime(target);
  runtime.localBoundsID = (runtime.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform<G extends symbol>(target: GraphNode<G>): void {
  const runtime = getGraphNodeRuntime(target);
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateParentReference<G extends symbol>(target: GraphNode<G>): void {
  const runtime = getGraphNodeRuntime(target);
  runtime.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateWorldBounds<G extends symbol>(target: GraphNode<G>): void {
  const runtime = getGraphNodeRuntime(target);
  runtime.worldBoundsUsingWorldTransformID = -1;
  runtime.worldBoundsUsingLocalBoundsID = -1;
}

export function recomputeWorldTransformID<G extends symbol>(
  runtime: GraphNodeRuntime<G>,
  parentRuntime?: Readonly<GraphNodeRuntime<G>>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
