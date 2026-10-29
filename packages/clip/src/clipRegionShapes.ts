// Generated from crates/flight-clip/src/clip_region_shapes.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';
import { createRectangle } from '@flighthq/geometry/contract';
import type { Rectangle } from '@flighthq/geometry/contract';
import { CIRCLE_KAPPA } from '@flighthq/math/contract';
import { appendPathCubicCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';

import { flattenClipPath } from './clipPath.ts';
import { createClipRegionFromRectangle } from './clipRegion.ts';
import type { ClipRegion } from './types.ts';
import { PathWinding } from './types.ts';

export function createClipRegionFromCircle(x: number, y: number, radius: number, tolerance?: number): ClipRegion {
  let path = createPath(PathWinding.NonZero);
  appendCircleToPath(path, x, y, radius);
  return createClipRegionFromPath(path, tolerance);
}

export function createClipRegionFromEllipse(rectangle: Readonly<Rectangle>, tolerance?: number): ClipRegion {
  let path = createPath(PathWinding.NonZero);
  appendEllipseToPath(path, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  return createClipRegionFromPath(path, tolerance);
}

export function createClipRegionFromPath(path: Readonly<Path>, tolerance?: number): ClipRegion {
  let out: ClipRegion = allocateEntity<ClipRegion>();
  initializeClipRegionFromPath(out, path, tolerance);
  return out;
}

export function createClipRegionFromRoundedRectangle(
  rectangle: Readonly<Rectangle>,
  radius: number,
  tolerance?: number,
): ClipRegion {
  if (radius <= 0.0) {
    return createClipRegionFromRectangle(rectangle);
  }
  let path = createPath(PathWinding.NonZero);
  appendRoundedRectToPath(path, rectangle.x, rectangle.y, rectangle.width, rectangle.height, radius);
  return createClipRegionFromPath(path, tolerance);
}

export function initializeClipRegionFromPath(out: ClipRegion, path: Readonly<Path>, tolerance?: number): void {
  let contours = [] as never[];
  flattenClipPath(contours, path, tolerance);
  out.rect = createRectangle(0.0, 0.0, 0.0, 0.0);
  setRectangleToContoursBounds(out.rect, contours);
  out.contours = contours;
  out.version = 0;
  out.winding = path.winding;
}

function appendCircleToPath(path: Path, cx: number, cy: number, radius: number): void {
  const k = radius * CIRCLE_KAPPA;
  appendPathMoveTo(path, cx, cy - radius);
  appendPathCubicCurveTo(path, cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy);
  appendPathCubicCurveTo(path, cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius);
  appendPathCubicCurveTo(path, cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy);
  appendPathCubicCurveTo(path, cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius);
}

function appendEllipseToPath(path: Path, x: number, y: number, width: number, height: number): void {
  const cx = x + width / 2.0;
  const cy = y + height / 2.0;
  const rx = width / 2.0;
  const ry = height / 2.0;
  const kx = rx * CIRCLE_KAPPA;
  const ky = ry * CIRCLE_KAPPA;
  appendPathMoveTo(path, cx, cy - ry);
  appendPathCubicCurveTo(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
  appendPathCubicCurveTo(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
  appendPathCubicCurveTo(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
  appendPathCubicCurveTo(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
}

function appendRoundedRectToPath(
  path: Path,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, Math.min(width, height) / 2.0);
  const k = corner * CIRCLE_KAPPA;
  const x1 = x + corner;
  const x2 = x + width - corner;
  const y1 = y + corner;
  const y2 = y + height - corner;
  appendPathMoveTo(path, x1, y);
  appendPathLineTo(path, x2, y);
  appendPathCubicCurveTo(path, x2 + k, y, x + width, y1 - k, x + width, y1);
  appendPathLineTo(path, x + width, y2);
  appendPathCubicCurveTo(path, x + width, y2 + k, x2 + k, y + height, x2, y + height);
  appendPathLineTo(path, x1, y + height);
  appendPathCubicCurveTo(path, x1 - k, y + height, x, y2 + k, x, y2);
  appendPathLineTo(path, x, y1);
  appendPathCubicCurveTo(path, x, y1 - k, x1 - k, y, x1, y);
}

function setRectangleToContoursBounds(out: Rectangle, contours: Readonly<number[][]>): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const contour of contours) {
    if (contour.length < 6 || contour.length % 2 !== 0) {
      continue;
    }
    let index = 0;
    while (index < contour.length) {
      minX = Math.min(minX, contour[index]);
      minY = Math.min(minY, contour[index + 1]);
      maxX = Math.max(maxX, contour[index]);
      maxY = Math.max(maxY, contour[index + 1]);
      index += 2;
    }
  }
  if (minX > maxX) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
    return;
  }
  out.x = minX;
  out.y = minY;
  out.width = maxX - minX;
  out.height = maxY - minY;
}
