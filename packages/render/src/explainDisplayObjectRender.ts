import type { HasAppearance, Kind, Renderable, RenderState } from '@flighthq/types';

import { getRenderProxy2D } from './renderProxy';
import { getRenderStateRuntime } from './renderState';

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

// The single most-likely blank cause, root-cause prioritized: no-renderer > not-prepared >
// not-visible > zero-alpha > ok (see explainDisplayObjectRender for why this ordering, not the literal
// buildRenderQueue check order).
export type DisplayObjectRenderBlankReason = 'no-renderer' | 'not-prepared' | 'not-visible' | 'zero-alpha' | 'ok';

// Recomputes why `source` would or would not draw against `state`, and returns it as plain data. Pure:
// reads only, allocates only the returned record, never mutates state (in particular never creates a
// proxy — it uses getRenderProxy2D, not getOrCreate), never throws even on a bare node, and retains
// nothing. Import it to debug a blank frame; it sheds from production when unimported.
//
// The reason is root-cause prioritized rather than following buildRenderQueue's literal check order
// (which drops on proxy===undefined, then !proxy.visible, then renderer===null). no-renderer is
// surfaced first because it is a static setup error — the "forgot registerRenderer for this kind"
// bug — that keeps the node blank no matter how the transient visible/alpha gates are fixed, and it is
// re-derivable from `kind` alone even before the node is prepared. not-prepared outranks the
// appearance gates for the same reason: nothing downstream matters until a proxy exists.
//
// Colocated with the render functions whose blank frame it explains — registerRenderer (renderer.ts),
// prepareDisplayObjectRender (renderProxy.ts), and buildRenderQueue (renderQueue.ts). This is the
// maintenance seam: a pull query duplicates the draw path's drop conditions, so if the draw path grows
// a new blank-reason gate, this function must gain the matching check or it silently goes stale.
export function explainDisplayObjectRender(state: RenderState, source: Renderable): DisplayObjectRenderExplanation {
  const kind = source.kind;
  const hasRenderer = getRenderStateRuntime(state).rendererMap.get(kind) !== undefined;

  const proxy = getRenderProxy2D(state, source);
  const prepared = proxy !== undefined;

  const appearance = source as unknown as HasAppearance;
  const visible = proxy !== undefined ? proxy.visible : appearance.visible;
  const effectiveAlpha = proxy !== undefined ? proxy.alpha : appearance.alpha;

  let reason: DisplayObjectRenderBlankReason;
  if (!hasRenderer) reason = 'no-renderer';
  else if (!prepared) reason = 'not-prepared';
  else if (!visible) reason = 'not-visible';
  else if (effectiveAlpha <= 0) reason = 'zero-alpha';
  else reason = 'ok';

  return { kind, hasRenderer, prepared, visible, effectiveAlpha, reason };
}
