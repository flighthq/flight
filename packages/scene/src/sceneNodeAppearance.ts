import { getNodeAppearanceRevision, invalidateNodeAppearance } from '@flighthq/node';
import type { SceneNode } from '@flighthq/types';

import { getSceneNodeRuntime } from './sceneNode';

// Ensures the node's resolved parent×self opacity (`worldAlpha`) is current, recomputing only when the
// node's own appearance revision or an ancestor's resolved appearance changed. Mirrors
// ensureNodeWorldMatrix4: walks the parent chain, caches on the runtime, and gates on revision ids —
// so worldAlpha is correct on demand, not only mid-render, and a clean node costs nothing to read.
export function ensureSceneNodeWorldAlpha(source: Readonly<SceneNode>): void {
  const runtime = getSceneNodeRuntime(source);
  const parent = runtime.parent as SceneNode | null;

  let parentWorldAlpha = 1;
  let parentWorldAppearanceId = 0;
  if (parent !== null) {
    ensureSceneNodeWorldAlpha(parent);
    const parentRuntime = getSceneNodeRuntime(parent);
    parentWorldAlpha = parentRuntime.worldAlpha!;
    parentWorldAppearanceId = parentRuntime.worldAppearanceId;
  }

  const appearanceId = getNodeAppearanceRevision(source);
  if (
    runtime.worldAlpha === null ||
    runtime.worldAlphaUsingAppearanceId !== appearanceId ||
    runtime.worldAlphaUsingParentAppearanceId !== parentWorldAppearanceId
  ) {
    runtime.worldAlpha = parentWorldAlpha * source.alpha;
    runtime.worldAlphaUsingAppearanceId = appearanceId;
    runtime.worldAlphaUsingParentAppearanceId = parentWorldAppearanceId;
    // Propagate a change downward exactly like computeNodeWorldTransformRevision builds worldTransformId.
    runtime.worldAppearanceId = ((appearanceId << 16) | (parentWorldAppearanceId & 0xffff)) >>> 0;
  }
}

// The resolved parent×self opacity the renderer honors per Mesh. Ensures on access (like
// getNodeWorldMatrix4), so it is correct whenever queried — 1 for a node with no appearance.
export function getSceneNodeWorldAlpha(source: Readonly<SceneNode>): number {
  ensureSceneNodeWorldAlpha(source);
  return getSceneNodeRuntime(source).worldAlpha ?? 1;
}

// Sets the node's own opacity and invalidates its appearance so the resolved worldAlpha (and its
// descendants') recomputes on next access. The appearance counterpart of writing a transform field
// and calling invalidateNodeLocalTransform.
export function setSceneNodeAlpha(source: SceneNode, alpha: number): void {
  source.alpha = alpha;
  invalidateNodeAppearance(source);
}
