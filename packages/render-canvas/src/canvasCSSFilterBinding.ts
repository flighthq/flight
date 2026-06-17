import { enableRenderFeatures, getOrCreateRenderNode2D, hasRenderFeatures } from '@flighthq/render';
import { type CanvasRenderState, type DisplayObject, RenderFeatures, type RenderNode2D } from '@flighthq/types';

// Per-state canvas CSS filter bindings, keyed by the render node. Render nodes are
// per-state (state.renderNodeMap), so a module-level map keyed by render node is
// automatically isolated per state — a filter set for one render state is
// invisible to any other state that renders the same display object. This mirrors
// the per-state WebGL shader bindings.
const _cssFilterBindings = new WeakMap<RenderNode2D, string>();

/**
 * Enables CSS filter support for the render state. Bindings made via
 * setCanvasCSSFilter are only applied while support is enabled — call this once
 * during setup, mirroring enableCanvasBlendModeSupport and the other opt-ins.
 */
export function enableCanvasCSSFilterSupport(state: CanvasRenderState): void {
  enableRenderFeatures(state, RenderFeatures.CSSFilter);
}

export function getCanvasCSSFilter(renderNode: RenderNode2D): string | undefined {
  return _cssFilterBindings.get(renderNode);
}

/**
 * Returns the CSS filter to draw renderNode with, or null when none is bound or
 * CSS filter support is disabled for the state. The feature gate keeps the lookup
 * off the hot path until at least one filter has been bound.
 */
export function resolveCanvasCSSFilter(state: CanvasRenderState, renderNode: RenderNode2D): string | null {
  if (hasRenderFeatures(state, RenderFeatures.CSSFilter)) {
    const filter = _cssFilterBindings.get(renderNode);
    if (filter !== undefined) return filter;
  }
  return null;
}

/**
 * Binds a CSS filter string (e.g. "blur(4px)") to a display object for the given
 * canvas render state, or clears it when filter is null. The binding lives on the
 * render state side, not the scene graph, so the same display object can carry a
 * different filter (or none) in different render states. The filter is applied via
 * `context.filter` around the object's own draw.
 */
export function setCanvasCSSFilter(state: CanvasRenderState, node: DisplayObject, filter: string | null): void {
  const renderNode = getOrCreateRenderNode2D(state, node);
  if (filter === null) {
    _cssFilterBindings.delete(renderNode);
    return;
  }
  _cssFilterBindings.set(renderNode, filter);
}
