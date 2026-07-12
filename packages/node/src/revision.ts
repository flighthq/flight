import type { Node, NodeRuntime } from '@flighthq/types';

import { getNodeRuntime } from './node';

export function computeNodeWorldTransformRevision<Traits extends object>(
  runtime: NodeRuntime<Traits>,
  parentRuntime?: Readonly<NodeRuntime<Traits>>,
): void {
  const localTransformId = runtime.localTransformId;
  const parentWorldTransformId = parentRuntime ? parentRuntime.worldTransformId : 0;
  runtime.worldTransformUsingLocalTransformId = localTransformId;
  runtime.worldTransformUsingParentTransformId = parentWorldTransformId;
  runtime.worldTransformId = (localTransformId << 16) | (parentWorldTransformId & 0xffff);
}

export function getNodeAppearanceRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).appearanceId;
}

export function getNodeLocalBoundsRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).localBoundsId;
}

export function getNodeLocalContentRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).localContentId;
}

export function getNodeLocalTransformRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).localTransformId;
}

export function getNodeWorldTransformRevision<Traits extends object>(source: Readonly<Node<Traits>>): number {
  return getNodeRuntime(source).worldTransformId;
}

/**
 * Target node's rendered content changed — the general direct-mutation companion. After mutating a
 * node's content fields in place (rather than through a setter), call this to invalidate the content
 * revision plus local bounds together, the uniform "the node's drawn payload and extent changed"
 * contract for any node kind. Setters keep their own precise per-field invalidation; this is the
 * broad companion, not a replacement for them. Never touches the transform.
 */
export function invalidateContent<Traits extends object>(target: Node<Traits>): void {
  invalidateNodeLocalContent(target);
  invalidateNodeLocalBounds(target);
}

export function invalidateNode<Traits extends object>(target: Node<Traits>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalBounds(target);
  invalidateNodeLocalContent(target);
  invalidateNodeLocalTransform(target);
  invalidateNodeParentReference(target);
  invalidateNodeWorldBounds(target);
}

/**
 * Target object's appearance changed (excluding transforms).
 */
export function invalidateNodeAppearance<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.appearanceId = (runtime.appearanceId + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateNodeLocalBounds<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.localBoundsId = (runtime.localBoundsId + 1) >>> 0;
}

/**
 * Target object's own drawable surface changed (the rasterizable payload — shape commands, text,
 * pixels — not its children and not how it is composited). Renderers re-rasterize on this; the walk
 * and render caches re-examine the node. Distinct from appearance (compositing) and bounds (extent).
 */
export function invalidateNodeLocalContent<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.localContentId = (runtime.localContentId + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY) changed.
 */
export function invalidateNodeLocalTransform<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.localTransformId = (runtime.localTransformId + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateNodeParentReference<Traits extends object>(target: Node<Traits>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Traits>;
  runtime.worldTransformUsingParentTransformId = -1;
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
  runtime.worldBoundsUsingWorldTransformId = -1;
  runtime.worldBoundsUsingLocalBoundsId = -1;
}
