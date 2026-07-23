import type {
  DisplayObjectRenderBlankReason,
  DisplayObjectRenderExplanation,
  HasAppearance,
  Renderable,
  RenderState,
} from '@flighthq/types';

import { getRenderProxy2D } from './renderProxy';
import { getRenderStateRuntime } from './renderState';

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
