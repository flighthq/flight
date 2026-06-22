import type { Entity } from './Entity';
import type { Matrix } from './Matrix';

/**
 * Backend-agnostic handle for a cached rendering. The user creates and holds a
 * RenderCache, attaches it to a scene node, and refreshes it when the cached
 * content changes. The actual backend resource (a CanvasRenderTarget,
 * GlRenderTarget, etc.) is owned by the render state and keyed by this handle,
 * never stored on the handle itself — so one handle can back its own resource on
 * each state it is used with, and a handle with no resource composites to nothing.
 *
 * `transform` places the cached content back at the source's scene position when
 * composited (it accounts for the bounds origin and any padding used while baking).
 */
export interface RenderCache extends Entity {
  kind: RenderCacheKind;
  transform: Matrix;
}

export const RenderCacheKind: unique symbol = Symbol('RenderCache');
export type RenderCacheKind = typeof RenderCacheKind;
