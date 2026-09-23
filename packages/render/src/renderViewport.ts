import { createRectangle, matrixTransformRectangle } from '@flighthq/geometry/contract';
import { getNodeWorldBoundsRectangle } from '@flighthq/node/contract';
import type { Matrix, Node2D, Rectangle, RenderProxy2D, Viewport } from '@flighthq/types/contract';

// Writes the world-space axis-aligned bounding box of `source` into `out`. Node2D carries the bounds and
// transform traits while retaining the concrete Node2DTraits family required by native ports.
export function computeRenderProxyWorldBounds(
  out: Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>,
  source: Node2D,
): void {
  const worldBounds = getNodeWorldBoundsRectangle(source);
  out.x = worldBounds.x;
  out.y = worldBounds.y;
  out.width = worldBounds.width;
  out.height = worldBounds.height;
}

// Returns true when `source` may be visible within `viewport`. Uses an inclusive overlap test on all four
// edges, so a zero-size object touching any viewport edge is considered in-viewport. When
// `renderTransform2D` is provided, the world bounds are transformed into screen space before the test.
export function isRenderableInViewport(
  source: Node2D,
  viewport: Readonly<Viewport>,
  renderTransform2D?: Readonly<Matrix> | null,
): boolean {
  computeRenderProxyWorldBounds(_scratchBounds, source);

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
  viewport: Readonly<Viewport>,
  renderTransform2D?: Readonly<Matrix> | null,
): boolean {
  return isRenderableInViewport(proxy.source, viewport, renderTransform2D);
}

// Module-level scratch rectangles used by isRenderableInViewport to avoid allocation on every call.
const _scratchBounds = createRectangle();
const _scratchTransformed = createRectangle();
