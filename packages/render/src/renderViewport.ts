import type { Rectangle } from '@flighthq/geometry';
import type { HasTransform2D, RenderProxy2D, RenderViewport2D } from '@flighthq/types';

// Detects whether `source` carries the HasTransform2D trait. Checks for `pivotX`, a field unique to
// that interface and not present on bare entities or trait-less proxies.
function hasTransform2D(source: unknown): source is HasTransform2D {
  return source !== null && typeof source === 'object' && 'pivotX' in (source as object);
}

// Writes the world-space axis-aligned bounding box of `source` into `out`. Returns true when
// `source` carries HasTransform2D and the bounds were written; returns false and leaves `out`
// unchanged when the source has no spatial trait. For a source at rest (default transform) the
// bounds collapse to (x, y, 0, 0) — a zero-size point at the object's position.
export function computeRenderProxyWorldBounds(out: Rectangle, source: unknown): boolean {
  if (!hasTransform2D(source)) return false;
  const s = source as HasTransform2D;
  out.x = s.x;
  out.y = s.y;
  out.width = 0;
  out.height = 0;
  return true;
}

// Allocates and returns a new RenderViewport2D with the given screen-space region.
export function createRenderViewport2D(x: number, y: number, width: number, height: number): RenderViewport2D {
  return { height, width, x, y };
}

// Returns true when `source` may be visible within `viewport`. Conservative: returns true when
// the source carries no HasTransform2D (spatial bounds unknown). When spatial bounds are
// available, uses an inclusive-left/top, exclusive-right/bottom overlap test so that a zero-size
// object touching the viewport's top-left corner is considered in-viewport.
export function isRenderableInViewport(source: unknown, viewport: Readonly<RenderViewport2D>): boolean {
  const bounds = _scratchBounds;
  if (!computeRenderProxyWorldBounds(bounds, source)) return true;

  const objMinX = bounds.x;
  const objMinY = bounds.y;
  const objMaxX = bounds.x + bounds.width;
  const objMaxY = bounds.y + bounds.height;

  const vpMinX = viewport.x;
  const vpMinY = viewport.y;
  const vpMaxX = viewport.x + viewport.width;
  const vpMaxY = viewport.y + viewport.height;

  return !(objMaxX < vpMinX || objMinX > vpMaxX || objMaxY < vpMinY || objMinY > vpMaxY);
}

// Returns true when the render proxy's source may be visible within `viewport`. Delegates to
// isRenderableInViewport using the proxy's source.
export function isRenderProxyInViewport(proxy: Readonly<RenderProxy2D>, viewport: Readonly<RenderViewport2D>): boolean {
  return isRenderableInViewport(proxy.source, viewport);
}

// Module-level scratch rectangle used by isRenderableInViewport to avoid allocation on every call.
const _scratchBounds = { x: 0, y: 0, width: 0, height: 0 } as Rectangle;
