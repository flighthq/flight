import { getNodeAppearanceRevision, invalidateNodeAppearance } from '@flighthq/node';
import type { Node3D } from '@flighthq/types';

import { getNode3DRuntime } from './sceneNode';

// Ensures the node's resolved parent×self opacity (`worldAlpha`) is current, recomputing only when the
// node's own appearance revision or an ancestor's resolved appearance changed. Mirrors
// ensureNodeWorldMatrix4: walks the parent chain, caches on the runtime, and gates on revision ids —
// so worldAlpha is correct on demand, not only mid-render, and a clean node costs nothing to read.
export function ensureNode3DWorldAlpha(source: Readonly<Node3D>): void {
  const runtime = getNode3DRuntime(source);
  const parent = runtime.parent as Node3D | null;

  let parentWorldAlpha = 1;
  let parentWorldAppearanceId = 0;
  if (parent !== null) {
    ensureNode3DWorldAlpha(parent);
    const parentRuntime = getNode3DRuntime(parent);
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
    // A fresh monotonic revision per recompute, mirroring computeNodeWorldTransformRevision: a composite
    // of (appearanceId, parentWorldAppearanceId) is lossy and would not carry a grandparent's alpha change
    // down to a grandchild, so the resolved id must change unconditionally whenever worldAlpha recomputes.
    _worldAppearanceRevisionCounter = (_worldAppearanceRevisionCounter + 1) >>> 0;
    if (_worldAppearanceRevisionCounter === 0) _worldAppearanceRevisionCounter = 1;
    runtime.worldAppearanceId = _worldAppearanceRevisionCounter;
  }
}

// The resolved parent×self opacity the renderer honors per Mesh. Ensures on access (like
// getNodeWorldMatrix4), so it is correct whenever queried — 1 for a node with no appearance.
export function getNode3DWorldAlpha(source: Readonly<Node3D>): number {
  ensureNode3DWorldAlpha(source);
  return getNode3DRuntime(source).worldAlpha ?? 1;
}

// Sets the node's own opacity and invalidates its appearance so the resolved worldAlpha (and its
// descendants') recomputes on next access. The appearance counterpart of writing a transform field
// and calling invalidateNodeLocalTransform.
export function setNode3DAlpha(source: Node3D, alpha: number): void {
  source.alpha = alpha;
  invalidateNodeAppearance(source);
}

// Monotonic source of resolved-appearance revisions, shared across nodes so a parent recompute always
// yields an id its children have not seen. Runtime-only (never serialized); wraps at 32 bits.
let _worldAppearanceRevisionCounter = 0;
