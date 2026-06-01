import type { GraphNode, GraphNodeRuntime } from '@flighthq/types';

import { getGraphNodeRuntime } from './graphNode';

export function getAppearanceRevision<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  return getGraphNodeRuntime(source).appearanceID;
}

export function getLocalBoundsRevision<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  return getGraphNodeRuntime(source).localBoundsID;
}

export function getLocalTransformRevision<GraphKind extends symbol, Traits extends object>(
  source: Readonly<GraphNode<GraphKind, Traits>>,
): number {
  return getGraphNodeRuntime(source).localTransformID;
}

export function getWorldTransformRevision<GraphKind extends symbol, Traits extends object>(
  source: GraphNode<GraphKind, Traits>,
): number {
  return getGraphNodeRuntime(source).worldTransformID;
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateAppearance<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  const runtime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
  runtime.appearanceID = (runtime.appearanceID + 1) >>> 0;
}

export function invalidateGraphNode<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  invalidateAppearance(target);
  invalidateLocalBounds(target);
  invalidateLocalTransform(target);
  invalidateParentReference(target);
  invalidateWorldBounds(target);
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateLocalBounds<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  const runtime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
  runtime.localBoundsID = (runtime.localBoundsID + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateLocalTransform<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  const runtime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
  runtime.localTransformID = (runtime.localTransformID + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateParentReference<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  const runtime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
  runtime.worldTransformUsingParentTransformID = -1;
}

/**
 * Target object's visual output changed (appearance or local transform).
 * Use this when animating properties like alpha, x, y, scaleX, scaleY, rotation.
 */
export function invalidateRender<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  invalidateAppearance(target);
  invalidateLocalTransform(target);
}

/**
 * Target object's child bounds have changed.
 */
export function invalidateWorldBounds<GraphKind extends symbol, Traits extends object>(
  target: GraphNode<GraphKind, Traits>,
): void {
  const runtime = getGraphNodeRuntime(target) as GraphNodeRuntime<GraphKind, Traits>;
  runtime.worldBoundsUsingWorldTransformID = -1;
  runtime.worldBoundsUsingLocalBoundsID = -1;
}

export function recomputeWorldTransformRevision<GraphKind extends symbol, Traits extends object>(
  runtime: GraphNodeRuntime<GraphKind, Traits>,
  parentRuntime?: Readonly<GraphNodeRuntime<GraphKind, Traits>>,
): void {
  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
