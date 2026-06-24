import {
  cloneRectangle,
  containsRectanglePointXY,
  copyRectangle,
  createRectangle,
  enclosesRectangle,
  intersectsRectangle,
  isEmptyRectangle,
  matrixTransformRectangle,
  mergeRectangle,
} from '@flighthq/geometry';
import { appendPathCubicCurveTo, appendPathLineTo, appendPathMoveTo, createPath, flattenPath } from '@flighthq/path';
import type { ClipRegion, MatrixLike, Path, PathWinding, RectangleLike } from '@flighthq/types';

// Returns a ClipRegion from the pool (as an empty rectangular region at the origin).
// Every acquireClipRegion must have a matching releaseClipRegion — treat them as paired brackets.
// Callers should initialize the acquired region immediately before use.
export function acquireClipRegion(): ClipRegion {
  const region = clipRegionPool.pop();
  if (region !== undefined) {
    region.rect.x = 0;
    region.rect.y = 0;
    region.rect.width = 0;
    region.rect.height = 0;
    region.contours = null;
    region.winding = 'nonZero';
    region.version = 0;
    return region;
  }
  return makeEmptyClipRegion();
}

// Returns true if a point (x, y) lies within the clip region (in clip-local space).
// For the rectangle form uses the rectangle bounds; for the contour form applies
// the exact winding rule (even-odd or non-zero point-in-polygon).
export function clipRegionContainsPoint(clip: Readonly<ClipRegion>, x: number, y: number): boolean {
  if (!containsRectanglePointXY(clip.rect, x, y)) return false;
  if (clip.contours === null) return true;
  return pointInContours(clip.contours, clip.winding, x, y);
}

// Returns true when the clip region fully contains the given rectangle.
// Rectangle form: exact containment; contour form: bounding-box approximation (conservative).
export function clipRegionContainsRectangle(clip: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>): boolean {
  return enclosesRectangle(clip.rect, rectangle);
}

// Returns true when the given rectangle overlaps the clip region.
// Rectangle form uses exact rect-vs-rect check; contour form falls back to bounding box (conservative).
export function clipRegionIntersectsRectangle(clip: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>): boolean {
  return intersectsRectangle(clip.rect, rectangle);
}

// Structural equality check. Does not use the version counter — compares geometry directly.
// Useful for cache reuse independent of manual invalidation. Contour comparison is exact (point-by-point).
export function clipRegionsEqual(a: Readonly<ClipRegion>, b: Readonly<ClipRegion>): boolean {
  if (a === b) return true;
  if (a.winding !== b.winding) return false;
  const ar = a.rect;
  const br = b.rect;
  if (ar.x !== br.x || ar.y !== br.y || ar.width !== br.width || ar.height !== br.height) return false;
  if (a.contours === null && b.contours === null) return true;
  if (a.contours === null || b.contours === null) return false;
  const ac = a.contours;
  const bc = b.contours;
  if (ac.length !== bc.length) return false;
  for (let i = 0; i < ac.length; i++) {
    const ai = ac[i];
    const bi = bc[i];
    if (ai.length !== bi.length) return false;
    for (let j = 0; j < ai.length; j++) {
      if (ai[j] !== bi[j]) return false;
    }
  }
  return true;
}

// Deep copy of a clip region (rect, contours arrays, winding). Version is preserved from the
// source so the caller can still detect change; call invalidateClipRegion after mutation.
export function cloneClipRegion(clip: Readonly<ClipRegion>): ClipRegion {
  const rect = cloneRectangle(clip.rect);
  const contours = clip.contours === null ? null : clip.contours.map((c) => c.slice());
  return { contours, rect, version: clip.version, winding: clip.winding };
}

// Copies source into out in place; does nothing when out === source. Bumps out.version
// (treats a retargeted region as changed so backends re-derive state).
export function copyClipRegion(out: ClipRegion, source: Readonly<ClipRegion>): void {
  if ((out as unknown) === (source as unknown)) return;
  copyRectangle(out.rect, source.rect);
  out.contours = source.contours === null ? null : source.contours.map((c) => c.slice());
  out.winding = source.winding;
  out.version = (out.version + 1) >>> 0;
}

// Builds a clip region from a circle. Internally approximates via cubic Bezier curves and flattens.
export function createClipRegionFromCircle(x: number, y: number, radius: number, tolerance = 0.25): ClipRegion {
  const path = createPath('nonZero');
  appendCircleToPath(path, x, y, radius);
  return createClipRegionFromPath(path, tolerance);
}

// Builds a clip region from raw flattened contours (x,y pairs per sub-path) and a winding rule.
// The caller is responsible for providing valid, closed contours. The bounding rect is computed
// from the contour data; pass an empty array for an empty region.
export function createClipRegionFromContours(contours: number[][], winding: PathWinding): ClipRegion {
  const rect = createRectangle();
  setRectangleToContoursBounds(rect, contours);
  return { contours, rect, version: 0, winding };
}

// Builds a clip region from an axis-aligned ellipse bounded by the given rectangle.
// Uses cubic Bezier approximation (kappa constant) and flattens via path.
export function createClipRegionFromEllipse(rectangle: Readonly<RectangleLike>, tolerance = 0.25): ClipRegion {
  const path = createPath('nonZero');
  appendEllipseToPath(path, rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  return createClipRegionFromPath(path, tolerance);
}

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
export function createClipRegionFromRectangle(rectangle: Readonly<RectangleLike>): ClipRegion {
  return { contours: null, rect: cloneRectangle(rectangle), version: 0, winding: 'nonZero' };
}

// Builds a clip region from a rounded rectangle with a uniform corner radius.
// Falls back to a plain rect clip when radius <= 0.
export function createClipRegionFromRoundedRectangle(
  rectangle: Readonly<RectangleLike>,
  radius: number,
  tolerance = 0.25,
): ClipRegion {
  if (radius <= 0) return createClipRegionFromRectangle(rectangle);
  const path = createPath('nonZero');
  appendRoundedRectToPath(path, rectangle.x, rectangle.y, rectangle.width, rectangle.height, radius);
  return createClipRegionFromPath(path, tolerance);
}

// Returns the bounding rect of a clip region in the given out rectangle.
export function getClipRegionBounds(out: RectangleLike, clip: Readonly<ClipRegion>): void {
  const r = clip.rect;
  out.x = r.x;
  out.y = r.y;
  out.width = r.width;
  out.height = r.height;
}

// Computes the intersection of two clip regions into out (alias-safe: out may be a or b).
// Rectangle∩Rectangle: exact scissor-eligible intersection via computeRectangleIntersection.
// All mixed or contour forms: bounding-box intersection (conservative — the renderer's stencil
// covers any finer geometry). Bumps out.version.
export function intersectClipRegions(out: ClipRegion, a: Readonly<ClipRegion>, b: Readonly<ClipRegion>): void {
  // Read all input values into locals first (alias-safe for out === a or out === b).
  const aRect = a.rect;
  const bRect = b.rect;
  const ax = aRect.x,
    ay = aRect.y,
    aw = aRect.width,
    ah = aRect.height;
  const bx = bRect.x,
    by = bRect.y,
    bw = bRect.width,
    bh = bRect.height;
  const aContours = a.contours;
  const bContours = b.contours;
  const aWinding = a.winding;
  const bWinding = b.winding;

  // Compute intersection rect (reusing local vars for clarity).
  const x0 = Math.max(ax, bx);
  const y0 = Math.max(ay, by);
  const x1 = Math.min(ax + aw, bx + bw);
  const y1 = Math.min(ay + ah, by + bh);

  if (x1 <= x0 || y1 <= y0) {
    // Disjoint: result is empty.
    out.rect.x = 0;
    out.rect.y = 0;
    out.rect.width = 0;
    out.rect.height = 0;
    out.contours = null;
    out.winding = 'nonZero';
    out.version = (out.version + 1) >>> 0;
    return;
  }

  out.rect.x = x0;
  out.rect.y = y0;
  out.rect.width = x1 - x0;
  out.rect.height = y1 - y0;

  if (aContours === null && bContours === null) {
    // Both rectangular: result is scissor-eligible.
    out.contours = null;
    out.winding = 'nonZero';
  } else if (aContours !== null && bContours === null) {
    // Contours ∩ rect: keep contours, clipped bounds computed above.
    out.contours = aContours.map((c) => c.slice());
    out.winding = aWinding;
  } else if (aContours === null && bContours !== null) {
    out.contours = bContours.map((c) => c.slice());
    out.winding = bWinding;
  } else {
    // Both contours: conservative — keep the finer of the two (larger number of contours) and
    // use its winding. The renderer's stencil-then-cover handles the true intersection.
    const keepA = aContours!.length >= bContours!.length;
    out.contours = (keepA ? aContours! : bContours!).map((c) => c.slice());
    out.winding = keepA ? aWinding : bWinding;
  }

  out.version = (out.version + 1) >>> 0;
}

// Marks the region's geometry changed so backends re-derive cached state. Mirrors invalidateImageResource.
export function invalidateClipRegion(clip: ClipRegion): void {
  clip.version = (clip.version + 1) >>> 0;
}

// Returns true if no area passes through the clip — either the bounding rect is empty or
// the contour array exists but has no entries.
export function isClipRegionEmpty(clip: Readonly<ClipRegion>): boolean {
  if (isEmptyRectangle(clip.rect)) return true;
  if (clip.contours !== null && clip.contours.length === 0) return true;
  return false;
}

// Returns true when the clip is in the scissor-eligible rectangle form (contours === null).
export function isClipRegionRectangular(clip: Readonly<ClipRegion>): boolean {
  return clip.contours === null;
}

// Canonicalizes a contour region back to the scissor-eligible rect form when the contour set is
// exactly (within NORMALIZE_EPSILON) an axis-aligned rectangle. This lightweight check works only
// on single-contour, 4-point (8 coordinate) contours — it does not require a full polygon-clipping
// kernel. When the contour is detected as a rectangular axis-aligned quad, the rect form is
// restored so downstream backends use the cheaper scissor path instead of stencil-then-cover.
// Otherwise out receives a copy of clip unchanged. Bumps out.version in all cases.
// Already-rectangular clips (contours === null) are copied through without modification.
export function normalizeClipRegion(out: ClipRegion, clip: Readonly<ClipRegion>): void {
  const inContours = clip.contours;
  const inRect = clip.rect;
  const inWinding = clip.winding;

  if (inContours === null) {
    // Already rect form: copy straight through.
    copyRectangle(out.rect, inRect);
    out.contours = null;
    out.winding = inWinding;
    out.version = (out.version + 1) >>> 0;
    return;
  }

  // Only attempt rect detection for a single contour with exactly 4 points (8 xy values).
  if (inContours.length === 1 && inContours[0].length === 8) {
    const c = inContours[0];
    const e = NORMALIZE_EPSILON;
    // Compute bounding box of the 4 points.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let i = 0; i < 8; i += 2) {
      const cx = c[i];
      const cy = c[i + 1];
      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
    }
    // Each point must sit at a corner of the bounding box.
    let isAxisAligned = true;
    for (let i = 0; i < 8; i += 2) {
      const cx = c[i];
      const cy = c[i + 1];
      if (!(Math.abs(cx - minX) <= e || Math.abs(cx - maxX) <= e)) {
        isAxisAligned = false;
        break;
      }
      if (!(Math.abs(cy - minY) <= e || Math.abs(cy - maxY) <= e)) {
        isAxisAligned = false;
        break;
      }
    }
    if (isAxisAligned) {
      out.rect.x = minX;
      out.rect.y = minY;
      out.rect.width = maxX - minX;
      out.rect.height = maxY - minY;
      out.contours = null;
      out.winding = 'nonZero';
      out.version = (out.version + 1) >>> 0;
      return;
    }
  }

  // Contours are not a simple axis-aligned rectangle: copy through unchanged.
  copyRectangle(out.rect, inRect);
  out.contours = inContours.map((c) => c.slice());
  out.winding = inWinding;
  out.version = (out.version + 1) >>> 0;
}

// Returns a ClipRegion to the pool. After release the caller must not use the region.
// Every acquireClipRegion must have a matching releaseClipRegion.
export function releaseClipRegion(clip: ClipRegion): void {
  clipRegionPool.push(clip);
}

// Retargets an existing region to a rectangle form in place, avoiding per-frame allocation
// in animated-clip scenarios. Bumps version.
export function setClipRegionToRectangle(out: ClipRegion, rectangle: Readonly<RectangleLike>): void {
  copyRectangle(out.rect, rectangle);
  out.contours = null;
  out.winding = 'nonZero';
  out.version = (out.version + 1) >>> 0;
}

// Applies a 2D affine matrix to a clip region and writes the result into out (alias-safe).
// Rectangle form: when the matrix is axis-aligned (b === 0 && c === 0) the result is scissor-eligible;
// otherwise, the rectangle is promoted to a 4-point contour quad so the scissor-eligibility invariant
// is maintained (a rotated/skewed rectangle is no longer axis-aligned). The bounding rect of
// the transformed geometry is recomputed for culling. Bumps version.
export function transformClipRegion(out: ClipRegion, clip: Readonly<ClipRegion>, matrix: Readonly<MatrixLike>): void {
  const ma = matrix.a;
  const mb = matrix.b;
  const mc = matrix.c;
  const md = matrix.d;
  const mtx = matrix.tx;
  const mty = matrix.ty;

  const inContours = clip.contours;
  const inRect = clip.rect;
  const inWinding = clip.winding;

  if (inContours === null) {
    const axisAligned = mb === 0 && mc === 0;
    if (axisAligned) {
      // Rectangle stays scissor-eligible: apply transform to the rect.
      matrixTransformRectangle(out.rect, matrix, inRect);
      out.contours = null;
      out.winding = 'nonZero';
    } else {
      // Rotation or skew: promote to 4-point quad contour.
      const rx = inRect.x;
      const ry = inRect.y;
      const rw = inRect.width;
      const rh = inRect.height;
      // Transform all four corners.
      const tlX = ma * rx + mc * ry + mtx;
      const tlY = mb * rx + md * ry + mty;
      const trX = ma * (rx + rw) + mc * ry + mtx;
      const trY = mb * (rx + rw) + md * ry + mty;
      const brX = ma * (rx + rw) + mc * (ry + rh) + mtx;
      const brY = mb * (rx + rw) + md * (ry + rh) + mty;
      const blX = ma * rx + mc * (ry + rh) + mtx;
      const blY = mb * rx + md * (ry + rh) + mty;
      const quad = [tlX, tlY, trX, trY, brX, brY, blX, blY];
      out.contours = [quad];
      out.winding = 'nonZero';
      setRectangleToContoursBounds(out.rect, [quad]);
    }
  } else {
    // Transform every contour point.
    const newContours: number[][] = new Array(inContours.length);
    for (let c = 0; c < inContours.length; c++) {
      const src = inContours[c];
      const dst: number[] = new Array(src.length);
      for (let i = 0; i < src.length; i += 2) {
        const ox = src[i];
        const oy = src[i + 1];
        dst[i] = ma * ox + mc * oy + mtx;
        dst[i + 1] = mb * ox + md * oy + mty;
      }
      newContours[c] = dst;
    }
    out.contours = newContours;
    out.winding = inWinding;
    setRectangleToContoursBounds(out.rect, newContours);
  }

  out.version = (out.version + 1) >>> 0;
}

// Computes the bounding-box union of two clip regions into out (conservative for contour forms).
// Both rectangular: exact mergeRectangle; any contour involved: union of their bounding rects,
// contours from the input with more sub-paths (heuristic), same winding. Bumps version.
export function unionClipRegions(out: ClipRegion, a: Readonly<ClipRegion>, b: Readonly<ClipRegion>): void {
  // Read inputs into locals (alias-safe).
  const aRect = a.rect;
  const bRect = b.rect;
  const aContours = a.contours;
  const bContours = b.contours;
  const aWinding = a.winding;
  const bWinding = b.winding;

  mergeRectangle(out.rect, aRect, bRect);

  if (aContours === null && bContours === null) {
    out.contours = null;
    out.winding = 'nonZero';
  } else if (aContours !== null && bContours === null) {
    out.contours = aContours.map((c) => c.slice());
    out.winding = aWinding;
  } else if (aContours === null && bContours !== null) {
    out.contours = bContours.map((c) => c.slice());
    out.winding = bWinding;
  } else {
    const keepA = aContours!.length >= bContours!.length;
    out.contours = (keepA ? aContours! : bContours!).map((c) => c.slice());
    out.winding = keepA ? aWinding : bWinding;
  }

  out.version = (out.version + 1) >>> 0;
}

// -- module-level pools, constants, and scratch helpers --

// Tolerance used when comparing floats in normalizeClipRegion.
const NORMALIZE_EPSILON = 1e-6;

// Kappa constant for circle/ellipse cubic Bezier approximation.
const KAPPA = 0.5522847498;

const clipRegionPool: ClipRegion[] = [];

function makeEmptyClipRegion(): ClipRegion {
  return { contours: null, rect: createRectangle(), version: 0, winding: 'nonZero' };
}

// Returns true if (px, py) is inside the contours according to the given winding rule.
// Uses a horizontal ray-cast to count crossings. Handles both 'nonZero' and 'evenOdd'.
function pointInContours(
  contours: Readonly<readonly (readonly number[])[]>,
  winding: PathWinding,
  px: number,
  py: number,
): boolean {
  let windingNumber = 0;
  for (let c = 0; c < contours.length; c++) {
    const contour = contours[c];
    const n = contour.length;
    if (n < 4) continue;
    for (let i = 0; i < n; i += 2) {
      const x0 = contour[i];
      const y0 = contour[i + 1];
      const x1 = contour[(i + 2) % n];
      const y1 = contour[(i + 3) % n];
      if (y0 <= py) {
        if (y1 > py) {
          // Upward crossing: is point to left of edge?
          if ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) {
            windingNumber++;
          }
        }
      } else {
        if (y1 <= py) {
          // Downward crossing: is point to right of edge?
          if ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) {
            windingNumber--;
          }
        }
      }
    }
  }
  if (winding === 'evenOdd') {
    return (windingNumber & 1) !== 0;
  }
  return windingNumber !== 0;
}

function appendCircleToPath(path: Path, cx: number, cy: number, r: number): void {
  const k = r * KAPPA;
  appendPathMoveTo(path, cx, cy - r);
  appendPathCubicCurveTo(path, cx + k, cy - r, cx + r, cy - k, cx + r, cy);
  appendPathCubicCurveTo(path, cx + r, cy + k, cx + k, cy + r, cx, cy + r);
  appendPathCubicCurveTo(path, cx - k, cy + r, cx - r, cy + k, cx - r, cy);
  appendPathCubicCurveTo(path, cx - r, cy - k, cx - k, cy - r, cx, cy - r);
}

function appendEllipseToPath(path: Path, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  appendPathMoveTo(path, cx, cy - ry);
  appendPathCubicCurveTo(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
  appendPathCubicCurveTo(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
  appendPathCubicCurveTo(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
  appendPathCubicCurveTo(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
}

function appendRoundedRectToPath(path: Path, x: number, y: number, w: number, h: number, r: number): void {
  const maxR = Math.min(w, h) / 2;
  const cr = Math.min(r, maxR);
  const k = cr * KAPPA;
  const x1 = x + cr;
  const x2 = x + w - cr;
  const y1 = y + cr;
  const y2 = y + h - cr;
  appendPathMoveTo(path, x1, y);
  appendPathLineTo(path, x2, y);
  appendPathCubicCurveTo(path, x2 + k, y, x + w, y1 - k, x + w, y1);
  appendPathLineTo(path, x + w, y2);
  appendPathCubicCurveTo(path, x + w, y2 + k, x2 + k, y + h, x2, y + h);
  appendPathLineTo(path, x1, y + h);
  appendPathCubicCurveTo(path, x1 - k, y + h, x, y2 + k, x, y2);
  appendPathLineTo(path, x, y1);
  appendPathCubicCurveTo(path, x, y1 - k, x1 - k, y, x1, y);
}

function setRectangleToContoursBounds(out: RectangleLike, contours: readonly (readonly number[])[]): void {
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
