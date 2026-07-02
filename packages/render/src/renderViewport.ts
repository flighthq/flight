import { createRectangle, matrixTransformRectangle } from '@flighthq/geometry';
import { getNodeWorldBoundsRectangle } from '@flighthq/node';
import type { Matrix, Rectangle, RenderProxy2D, RenderViewport2D, Spatial2DNode } from '@flighthq/types';

// Writes the world-space axis-aligned bounding box of `source` into `out`. Returns true when
// `source` is a Spatial2DNode and the bounds were written; returns false and leaves `out`
// unchanged when the source has no spatial traits.
export function computeRenderProxyWorldBounds(
  out: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>,
  source: unknown,
): boolean {
  if (!isSpatial2DNode(source)) return false;
  const worldBounds = getNodeWorldBoundsRectangle(source);
  out.x = worldBounds.x;
  out.y = worldBounds.y;
  out.width = worldBounds.width;
  out.height = worldBounds.height;
  return true;
}

// Allocates and returns a new RenderViewport2D with the given screen-space region.
export function createRenderViewport2D(x: number, y: number, width: number, height: number): RenderViewport2D {
  return { height, width, x, y };
}

// Returns true when `source` may be visible within `viewport`. Conservative: returns true when
// the source carries no spatial traits (bounds unknown). When spatial bounds are available, uses
// an inclusive overlap test on all four edges so that a zero-size object touching any viewport
// edge is considered in-viewport. When `renderTransform2D` is provided, the world bounds are
// transformed into screen space before the overlap test.
export function isRenderableInViewport(
  source: unknown,
  viewport: Readonly<RenderViewport2D>,
  renderTransform2D?: Readonly<Matrix> | null,
): boolean {
  if (!computeRenderProxyWorldBounds(_scratchBounds, source)) return true;

  let bounds = _scratchBounds;
  if (renderTransform2D != null) {
    matrixTransformRectangle(_scratchTransformed, renderTransform2D, _scratchBounds);
    bounds = _scratchTransformed;
  }

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
export function isRenderProxyInViewport(
  proxy: Readonly<RenderProxy2D>,
  viewport: Readonly<RenderViewport2D>,
  renderTransform2D?: Readonly<Matrix> | null,
): boolean {
  return isRenderableInViewport(proxy.source, viewport, renderTransform2D);
}

// Detects whether `source` carries the HasTransform2D trait (and thus is at least a Transform2DNode).
// Nodes that pass through createRenderProxy2D carry both HasTransform2D and HasBoundsRectangle,
// making them Spatial2DNode — the bounds runtime is guaranteed present.
function isSpatial2DNode(source: unknown): source is Spatial2DNode {
  return source !== null && typeof source === 'object' && 'pivotX' in (source as object);
}

// Module-level scratch rectangles used by isRenderableInViewport to avoid allocation on every call.
const _scratchBounds = createRectangle();
const _scratchTransformed = createRectangle();
