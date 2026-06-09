import { enableRenderFeatures, getOrCreateDisplayObjectRenderNode, hasRenderFeatures } from '@flighthq/render';
import { type DisplayObject, type DOMRenderState, RenderFeatures, type RenderNode2D } from '@flighthq/types';

// Per-state DOM CSS filter bindings, keyed by the render node. Render nodes are
// per-state (state.renderNodeMap), so a module-level map keyed by render node is
// automatically isolated per state — a filter set for one render state is
// invisible to any other state that renders the same display object. This mirrors
// the per-state canvas CSS filter and WebGL shader bindings.
const _cssFilterBindings = new WeakMap<RenderNode2D, string>();

export function getDOMCSSFilter(renderNode: RenderNode2D): string | undefined {
  return _cssFilterBindings.get(renderNode);
}

/**
 * Returns the CSS filter to style renderNode's element with, or null when none is
 * bound or CSS filter support is disabled for the state. The feature gate keeps the
 * lookup off the hot path until at least one filter has been bound.
 */
export function selectDOMCSSFilter(state: DOMRenderState, renderNode: RenderNode2D): string | null {
  if (hasRenderFeatures(state, RenderFeatures.CSSFilter)) {
    const filter = _cssFilterBindings.get(renderNode);
    if (filter !== undefined) return filter;
  }
  return null;
}

/**
 * Binds a CSS filter string (e.g. "blur(4px)") to a display object for the given
 * DOM render state, or clears it when filter is null. The binding lives on the
 * render state side, not the scene graph, so the same display object can carry a
 * different filter (or none) in different render states. The filter is applied via
 * the element's `style.filter`.
 */
export function setDOMCSSFilter(state: DOMRenderState, node: DisplayObject, filter: string | null): void {
  const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
  if (filter === null) {
    _cssFilterBindings.delete(renderNode);
    return;
  }
  _cssFilterBindings.set(renderNode, filter);
  enableRenderFeatures(state, RenderFeatures.CSSFilter);
}
