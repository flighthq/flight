import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, DomRenderState, RenderProxy2D } from '@flighthq/types';

/**
 * Enables CSS filter support for the render state by installing the resolver the
 * draw path consults. Bindings made via setDomCssFilter only apply once this is
 * called — mirroring enableDomBlendModeSupport and the other opt-ins. The draw
 * path reaches the resolver only through this field, so filter-free states leave
 * it null and the binding module tree-shakes away entirely.
 */
export function enableDomCssFilterSupport(state: DomRenderState): void {
  state.domCssFilterResolver = getDomCssFilter;
}

export function getDomCssFilter(renderProxy: RenderProxy2D): string | undefined {
  return _cssFilterBindings.get(renderProxy);
}

/**
 * Binds a CSS filter string (e.g. "blur(4px)") to a display object for the given
 * DOM render state, or clears it when filter is null. The binding lives on the
 * render state side, not the scene graph, so the same display object can carry a
 * different filter (or none) in different render states. The filter is applied via
 * the element's `style.filter` while CSS filter support is enabled.
 */
export function setDomCssFilter(state: DomRenderState, node: DisplayObject, filter: string | null): void {
  const renderProxy = getOrCreateRenderProxy2D(state, node);
  if (filter === null) {
    _cssFilterBindings.delete(renderProxy);
    return;
  }
  _cssFilterBindings.set(renderProxy, filter);
}

// Per-state DOM CSS filter bindings, keyed by the render node. Render nodes are
// per-state (state.renderProxyMap), so a module-level map keyed by render node is
// automatically isolated per state — a filter set for one render state is
// invisible to any other state that renders the same display object. This mirrors
// the per-state canvas CSS filter and Gl shader bindings.
const _cssFilterBindings = new WeakMap<RenderProxy2D, string>();
