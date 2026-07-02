import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { CanvasRenderState, DisplayObject, RenderProxy2D } from '@flighthq/types';

// Per-state canvas CSS filter bindings, keyed by the render node. Render nodes are
// per-state (state.renderProxyMap), so a module-level map keyed by render node is
// automatically isolated per state — a filter set for one render state is
// invisible to any other state that renders the same display object. This mirrors
// the per-state Gl shader bindings.
const _cssFilterBindings = new WeakMap<RenderProxy2D, string>();

/**
 * Enables CSS filter support for the render state by installing the resolver the
 * draw loop consults. Bindings made via setCanvasCssFilter only apply once this is
 * called — mirroring enableCanvasBlendMode and the other opt-ins. Because
 * the draw loop reaches the resolver only through this field, filter-free states
 * leave it null and the binding module tree-shakes away entirely.
 */
export function enableCanvasCssFilter(state: CanvasRenderState): void {
  state.canvasCssFilterResolver = resolveCanvasCssFilter;
}

export function getCanvasCssFilter(renderProxy: RenderProxy2D): string | undefined {
  return _cssFilterBindings.get(renderProxy);
}

/**
 * Returns the CSS filter to draw renderProxy with, or null when none is bound.
 * Installed as state.canvasCssFilterResolver by enableCanvasCssFilter.
 */
export function resolveCanvasCssFilter(_state: CanvasRenderState, renderProxy: RenderProxy2D): string | null {
  return _cssFilterBindings.get(renderProxy) ?? null;
}

/**
 * Binds a CSS filter string (e.g. "blur(4px)") to a display object for the given
 * canvas render state, or clears it when filter is null. The binding lives on the
 * render state side, not the scene graph, so the same display object can carry a
 * different filter (or none) in different render states. The filter is applied via
 * `context.filter` around the object's own draw.
 */
export function setCanvasCssFilter(state: CanvasRenderState, node: DisplayObject, filter: string | null): void {
  const renderProxy = getOrCreateRenderProxy2D(state, node);
  if (filter === null) {
    _cssFilterBindings.delete(renderProxy);
    return;
  }
  _cssFilterBindings.set(renderProxy, filter);
}
