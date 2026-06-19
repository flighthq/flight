import { cloneRectangle, createRectangle } from '@flighthq/geometry';
import { flattenPath } from '@flighthq/path';
import type { ClipRegion, Path, Rectangle } from '@flighthq/types';

// Builds a clip region from arbitrary path geometry. The path is flattened to contours now (cached on
// the region; re-create to change), and the region's rect is set to their bounding box for culling and
// the stencil cover quad. Realized by stencil-then-cover, so it handles concavity, holes, and
// self-intersection per the path's own winding rule.
export function createClipRegionFromPath(path: Readonly<Path>, tolerance = 0.25): ClipRegion {
  const contours = flattenPath(path, tolerance);
  const rect = createRectangle();
  setRectangleToContoursBounds(rect, contours);
  return { contours, rect, version: 0, winding: path.winding };
}

// Builds a rectangular clip region — the allocation-light, scissor-eligible form. The rectangle is
// copied so later edits to the caller's rectangle do not mutate the region; bump via invalidateClipRegion.
export function createClipRegionFromRectangle(rectangle: Readonly<Rectangle>): ClipRegion {
  return { contours: null, rect: cloneRectangle(rectangle), version: 0, winding: 'nonZero' };
}

// Marks the region's geometry changed so backends re-derive cached state. Mirrors invalidateImageResource.
export function invalidateClipRegion(clip: ClipRegion): void {
  clip.version = (clip.version + 1) >>> 0;
}

function setRectangleToContoursBounds(out: Rectangle, contours: readonly (readonly number[])[]): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let c = 0; c < contours.length; c++) {
    const contour = contours[c];
    for (let i = 0; i < contour.length; i += 2) {
      const x = contour[i];
      const y = contour[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX) {
    out.x = 0;
    out.y = 0;
    out.width = 0;
    out.height = 0;
    return;
  }
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
}
