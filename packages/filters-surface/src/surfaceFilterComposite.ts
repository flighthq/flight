import { getShadowFilterOffset } from '@flighthq/filters-math';
import { compositeSurfacePixels, compositeSurfaceRegion } from '@flighthq/surface';
import type { BevelFilter, BitmapFilter, DropShadowFilter, InnerShadowFilter, SurfaceRegion } from '@flighthq/types';

/** Compositing role of a filter: how its mask relates to the source object. */
export type FilterCompositeRole = 'inner' | 'outer' | 'outer-offset';

/**
 * Composites a drop shadow at the given pixel offset onto `dest`, then
 * composites the source on top (unless `filter.knockout` or `filter.hideObject`
 * is true). This is the offset-aware counterpart to
 * `compositeFilterResultToSurface` for DropShadowFilter.
 *
 * `mask` is the raw pixel buffer produced by `applyDropShadowFilterToSurface`.
 * `dx`/`dy` are the shadow offset in pixels (use `getShadowFilterOffset` to
 * derive them from `filter.angle`/`filter.distance`).
 *
 * `dest` must be large enough to accommodate both the source and the shifted
 * shadow — typically `source.width + |dx|` by `source.height + |dy|`.
 */
export function compositeDropShadowFilterResultToSurface(
  dest: Readonly<SurfaceRegion>,
  mask: Readonly<Uint8ClampedArray>,
  source: Readonly<SurfaceRegion>,
  filter: Readonly<DropShadowFilter>,
): void {
  const offsetScratch = { dx: 0, dy: 0 };
  getShadowFilterOffset(filter, offsetScratch);
  const dx = offsetScratch.dx;
  const dy = offsetScratch.dy;
  const knockout = filter.knockout ?? false;
  const hideObject = filter.hideObject ?? false;
  // Place the shadow at (dx, dy) by building a shifted SurfaceRegion that
  // points into dest at the offset position.
  const shadowWidth = source.width;
  const shadowHeight = source.height;
  const shadowX = dest.x + dx;
  const shadowY = dest.y + dy;
  // Write the mask into dest at the offset position using a temporary surface
  // that shares the dest data.
  const shiftedDest: SurfaceRegion = {
    surface: dest.surface,
    x: shadowX,
    y: shadowY,
    width: shadowWidth,
    height: shadowHeight,
  };
  compositeSurfacePixels(shiftedDest, mask);
  if (!knockout && !hideObject) {
    compositeSurfaceRegion(dest, source);
  }
}

/**
 * Composites a filter mask onto `dest` following the `knockout`/`hideObject`
 * semantics for `filter`. Resolves the repeated compositing prose in each
 * adapter's doc comment into one authoritative function.
 *
 * Compositing rules by filter role:
 *
 * **Outer effects** (OuterGlowFilter, BevelFilter, GradientBevelFilter,
 * GradientGlowFilter, DropShadowFilter — any filter whose mask extends outside
 * the source shape):
 *   - Normal: `mask` → `dest`, then `source` on top.
 *   - `knockout`: `mask` → `dest` only (source omitted).
 *   - `hideObject` (DropShadowFilter only): `mask` → `dest` only.
 *
 * **Inner effects** (InnerGlowFilter, InnerShadowFilter — mask is clipped
 * inside the source shape):
 *   - Normal: `source` → `dest`, then `mask` on top.
 *   - `knockout`: `mask` → `dest` only (source omitted).
 *
 * `mask` is a raw `Uint8ClampedArray` of `source.width * source.height * 4`
 * bytes, produced by an `apply*FilterToSurface` call.
 *
 * For DropShadowFilter the `dx`/`dy` offset must be applied by the caller
 * before invoking this function — place `mask` pixels at the offset position
 * in `dest` before compositing the source on top. This function only handles
 * the layer ordering; it does not re-derive the offset.
 *
 * `dest` will have its `invalidateImageResource` flag updated automatically
 * via the surface compositing helpers.
 */
export function compositeFilterResultToSurface(
  dest: Readonly<SurfaceRegion>,
  mask: Readonly<Uint8ClampedArray>,
  source: Readonly<SurfaceRegion>,
  filter: Readonly<BitmapFilter>,
): void {
  const role = getFilterCompositeRole(filter);
  // Safe field access: these optional fields exist on some filter kinds but not all.
  // Using `in` avoids constructing an impossible intersection type.
  const knockout = 'knockout' in filter ? ((filter as { knockout?: boolean }).knockout ?? false) : false;
  const hideObject = 'hideObject' in filter ? ((filter as { hideObject?: boolean }).hideObject ?? false) : false;
  if (role === 'inner') {
    // Inner effects: source goes first, mask on top (unless knockout).
    if (!knockout) {
      compositeSurfaceRegion(dest, source);
    }
    compositeSurfacePixels(dest, mask);
  } else {
    // Outer and outer-offset effects: mask goes first, source on top.
    compositeSurfacePixels(dest, mask);
    if (!knockout && !hideObject) {
      compositeSurfaceRegion(dest, source);
    }
  }
}

/**
 * Returns the `getShadowFilterOffset` result for a shadow or bevel filter.
 * Convenience wrapper that allocates the result object; in hot paths use
 * `getShadowFilterOffset` directly with a pre-allocated `out`.
 *
 * @internal Exported for tests and `applyFilterListToSurface`.
 */
export function computeFilterSurfaceOffset(filter: Readonly<DropShadowFilter | InnerShadowFilter | BevelFilter>): {
  dx: number;
  dy: number;
} {
  const out = { dx: 0, dy: 0 };
  getShadowFilterOffset(filter, out);
  return out;
}

/**
 * Returns the compositing role of `filter`:
 * - `'outer-offset'`: mask goes behind source with a positional offset
 *   (DropShadowFilter).
 * - `'outer'`: mask goes behind source, centered (OuterGlowFilter,
 *   GradientGlowFilter, BevelFilter, GradientBevelFilter).
 * - `'inner'`: mask goes on top of source, clipped inside the shape
 *   (InnerGlowFilter, InnerShadowFilter).
 *
 * Returns `'outer'` for unrecognized filter kinds.
 */
export function getFilterCompositeRole(filter: Readonly<BitmapFilter>): FilterCompositeRole {
  switch (filter.kind) {
    case 'DropShadowFilter':
      return 'outer-offset';
    case 'InnerGlowFilter':
    case 'InnerShadowFilter':
      return 'inner';
    default:
      return 'outer';
  }
}
