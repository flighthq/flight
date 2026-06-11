import type { Surface, SurfaceRegion } from '@flighthq/types';

/**
 * Allocates a `SurfaceRegion`. With no bounds it covers the whole surface, so
 * `createSurfaceRegion(surface)` is the fast path for "operate on everything".
 *
 * Region functions read these fields synchronously and never retain the object,
 * so in a hot loop you can allocate one region up front and reuse it with
 * `setSurfaceRegion` instead of building a literal per call.
 */
export function createSurfaceRegion(
  surface: Surface,
  x: number = 0,
  y: number = 0,
  width: number = surface.width,
  height: number = surface.height,
): SurfaceRegion {
  return { surface, x, y, width, height };
}

/**
 * Writes region fields into an existing `out` region without allocating, and
 * returns `out`. With no bounds it covers the whole surface. Use this to thread
 * a single reusable region through a hot loop:
 *
 *   const r = createSurfaceRegion(surface);
 *   for (…) fillSurfaceRectangle(setSurfaceRegion(r, surface, x, y, w, h), color);
 */
export function setSurfaceRegion(
  out: SurfaceRegion,
  surface: Surface,
  x: number = 0,
  y: number = 0,
  width: number = surface.width,
  height: number = surface.height,
): SurfaceRegion {
  out.surface = surface;
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  return out;
}
