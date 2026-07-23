import type { DisplayObjectRenderBlankReason } from './DisplayObjectRenderBlankReason';
import type { Kind } from './Entity';

// Plain-data answer to "why is this display object blank?", the pull half of the diagnostics
// convention: recomputed on demand from live render state, holding no reference to it. Every field is
// re-derived by reading the same seams the draw path reads, so an agent or test can assert on the
// cause without a human-readable string. Format for humans in a separate format* companion, never here.
export interface DisplayObjectRenderExplanation {
  readonly kind: Kind;
  // A renderer is registered for `kind` on this state (the getOrCreateRenderProxy2D / buildRenderQueue
  // lookup, re-run). False is the classic blank-on-a-new-backend bug: prepared and visible, but no
  // registerRenderer(state, kind, renderer) for this kind, so buildRenderQueue never emits a draw.
  readonly hasRenderer: boolean;
  // A render proxy exists for `source`, i.e. prepareDisplayObjectRender reached it. False when prepare
  // was never called, or an ancestor was disabled/hidden so the prepare walk stopped before this node.
  readonly prepared: boolean;
  // Effective visibility and alpha. When prepared these come off the proxy, which folds in the
  // appearance of every ancestor the prepare walk actually reached (recalculateAppearance), so a
  // partially-faded ancestor surfaces here as a reduced effectiveAlpha on the child. Note a fully
  // hidden or zero-alpha ancestor stops the walk before the child instead of folding through it, so
  // that child reads as prepared:false / not-prepared rather than not-visible. Before prepare there is
  // no proxy and no resolved parent chain, so these fall back to the node's own raw appearance fields
  // — best-effort values dominated by prepared:false.
  readonly visible: boolean;
  readonly effectiveAlpha: number;
  readonly reason: DisplayObjectRenderBlankReason;
}
