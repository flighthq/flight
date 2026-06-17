import { enableRenderFeatures, getOrCreateRenderNode2D } from '@flighthq/render';
import { type DisplayObject, type DOMRenderState, RenderFeatures, type RenderNode2D } from '@flighthq/types';

// Per-state DOM CSS filter bindings, keyed by the render node. Render nodes are
// per-state (state.renderNodeMap), so a module-level map keyed by render node is
// automatically isolated per state — a filter set for one render state is
// invisible to any other state that renders the same display object. This mirrors
// the per-state canvas CSS filter and WebGL shader bindings.
const _cssFilterBindings = new WeakMap<RenderNode2D, string>();

/**
 * Enables CSS filter support for the render state. Bindings made via
 * setDOMCSSFilter are only applied while support is enabled — call this once
 * during setup, mirroring enableDOMBlendModeSupport and the other opt-ins.
 */
export function enableDOMCSSFilterSupport(state: DOMRenderState): void {
  enableRenderFeatures(state, RenderFeatures.CSSFilter);
}

export function getDOMCSSFilter(renderNode: RenderNode2D): string | undefined {
  return _cssFilterBindings.get(renderNode);
}

/**
 * Binds a CSS filter string (e.g. "blur(4px)") to a display object for the given
 * DOM render state, or clears it when filter is null. The binding lives on the
 * render state side, not the scene graph, so the same display object can carry a
 * different filter (or none) in different render states. The filter is applied via
 * the element's `style.filter` while CSS filter support is enabled.
 */
export function setDOMCSSFilter(state: DOMRenderState, node: DisplayObject, filter: string | null): void {
  const renderNode = getOrCreateRenderNode2D(state, node);
  if (filter === null) {
    _cssFilterBindings.delete(renderNode);
    return;
  }
  _cssFilterBindings.set(renderNode, filter);
}
