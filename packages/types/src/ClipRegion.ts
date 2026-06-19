import type { Rectangle } from './Rectangle';
import type { PathWinding } from './ShapeCommand';

/**
 * A hard, geometric clip — the masking primitive. Transform-exact: it re-rasterizes crisp at the
 * target transform every frame (no cached texture; softness is the matte's job, see MatteFilter). One
 * of two forms, discriminated by `contours`:
 *
 *  - `contours === null` — an axis-aligned rectangle (`rect`). Realized as a GPU scissor when the
 *    world transform is axis-aligned, else a stencil quad. Allocation-free to build.
 *  - `contours !== null` — arbitrary fill geometry: flattened contours (flat x,y pairs, in clip-local
 *    space) realized by stencil-then-cover. `rect` holds their bounding box, for culling and the cover
 *    quad.
 *
 * `version` bumps when the geometry changes (see `invalidateClipRegion`); a backend compares it like a
 * texture version to know when to re-upload derived state. Build with the `createClipRegionFrom*`
 * producers in `@flighthq/clip`. Plain data — the caller owns it and its lifetime.
 */
export interface ClipRegion {
  rect: Rectangle;
  contours: number[][] | null;
  /** Fill rule for the contour form (canvas clip rule / stencil winding accumulation). 'nonZero' for rects. */
  winding: PathWinding;
  version: number;
}
