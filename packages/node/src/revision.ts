import type { Node, NodeRuntime } from '@flighthq/types/contract';

import { getNodeRuntime } from './node.ts';

// Records that the node's world transform was just recomputed. `worldTransformId` must change on every
// recompute so descendants gated on it re-resolve: a child stores its parent's `worldTransformId` and
// recomputes when it differs. A composite of (localTransformId, parentWorldTransformId) is NOT enough —
// it is lossy (an ancestor two-plus levels up changes a node's world matrix without changing the node's
// own composite id, since the ancestor's contribution does not survive into the low bits), so the change
// never reaches grandchildren. A fresh monotonic revision per recompute is unconditionally propagating.
export function computeNodeWorldTransformRevision<Fields extends object>(
  runtime: NodeRuntime<Fields>,
  parentRuntime?: Readonly<NodeRuntime<Fields>>,
): void {
  runtime.worldTransformUsingLocalTransformId = runtime.localTransformId;
  runtime.worldTransformUsingParentTransformId = parentRuntime ? parentRuntime.worldTransformId : 0;
  _worldTransformRevisionCounter = (_worldTransformRevisionCounter + 1) >>> 0;
  // 0 is the fresh-runtime sentinel (never a live revision), so step past a wrap back to 0.
  if (_worldTransformRevisionCounter === 0) _worldTransformRevisionCounter = 1;
  runtime.worldTransformId = _worldTransformRevisionCounter;
}

export function getNodeAppearanceRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).appearanceId;
}

export function getNodeChildrenRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).childrenId;
}

export function getNodeLocalBoundsRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).localBoundsId;
}

export function getNodeLocalContentRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).localContentId;
}

export function getNodeLocalTransformRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).localTransformId;
}

export function getNodeParentReferenceRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).parentReferenceId;
}

export function getNodeWorldTransformRevision<Fields extends object>(source: Readonly<Node<Fields>>): number {
  return getNodeRuntime(source).worldTransformId;
}

/**
 * Target node's rendered content changed — the general direct-mutation companion. After mutating a
 * node's content fields in place (rather than through a setter), call this to invalidate the content
 * revision plus local bounds together, the uniform "the node's drawn payload and extent changed"
 * contract for any node kind. Setters keep their own precise per-field invalidation; this is the
 * broad companion, not a replacement for them. Never touches the transform.
 */
export function invalidateContent<Fields extends object>(target: Node<Fields>): void {
  invalidateNodeLocalContent(target);
  invalidateNodeLocalBounds(target);
}

export function invalidateNode<Fields extends object>(target: Node<Fields>): void {
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
export function invalidateNodeAppearance<Fields extends object>(target: Node<Fields>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Fields>;
  runtime.appearanceId = (runtime.appearanceId + 1) >>> 0;
}

/**
 * Target object's own dimensions (not including children) changed.
 */
export function invalidateNodeLocalBounds<Fields extends object>(target: Node<Fields>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Fields>;
  runtime.localBoundsId = (runtime.localBoundsId + 1) >>> 0;
}

/**
 * Target object's own drawable surface changed (the rasterizable payload — shape commands, text,
 * pixels — not its children and not how it is composited). Renderers re-rasterize on this; the walk
 * and render caches re-examine the node. Distinct from appearance (compositing) and bounds (extent).
 */
export function invalidateNodeLocalContent<Fields extends object>(target: Node<Fields>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Fields>;
  runtime.localContentId = (runtime.localContentId + 1) >>> 0;
}

/**
 * Target object's own transform (x, y, rotation, scaleX, scaleY, skewX, skewY, or pivot) changed.
 */
export function invalidateNodeLocalTransform<Fields extends object>(target: Node<Fields>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Fields>;
  runtime.localTransformId = (runtime.localTransformId + 1) >>> 0;
}

/**
 * Target object's parent changed.
 */
export function invalidateNodeParentReference<Fields extends object>(target: Node<Fields>): void {
  const runtime = getNodeRuntime(target) as NodeRuntime<Fields>;
  runtime.parentReferenceId = (runtime.parentReferenceId + 1) >>> 0;
  runtime.worldTransformUsingParentTransformId = -1;
}

/**
 * Target object's visual output changed (appearance or local transform).
 * Use this when animating properties like alpha, x, y, scaleX, scaleY, rotation.
 */
export function invalidateNodeRender<Fields extends object>(target: Node<Fields>): void {
  invalidateNodeAppearance(target);
  invalidateNodeLocalTransform(target);
}

/**
 * Target object's child bounds have changed. Invalidates the target and every ancestor whose
 * aggregate world bounds include it.
 */
export function invalidateNodeWorldBounds<Fields extends object>(target: Node<Fields>): void {
  let current: Node<Fields> | null = target;
  while (current !== null) {
    const runtime = getNodeRuntime(current) as NodeRuntime<Fields>;
    runtime.worldBoundsUsingWorldTransformId = -1;
    runtime.worldBoundsUsingLocalBoundsId = -1;
    current = runtime.parent;
  }
}

// Monotonic source of world-transform revisions, shared across all nodes so a parent recompute always
// yields an id its children have not seen. Runtime-only (never serialized); wraps at 32 bits.
let _worldTransformRevisionCounter = 0;
