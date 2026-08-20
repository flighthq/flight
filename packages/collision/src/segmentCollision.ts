import type {
  CollisionAabb2D,
  CollisionCircle2D,
  CollisionObb2D,
  CollisionPolygon2D,
  CollisionSegment2D,
} from '@flighthq/types/contract';

import { getCollisionPolygonValidationStatus2D } from './collisionShapeValidation';

// Segment-vs-shape overlap queries. Segments are area-less, so these return a boolean rather than a
// manifold (a swept/contact answer is a later phase). All are boundary-inclusive: a segment that
// just grazes a shape counts as overlapping.

const RELATIVE_EPSILON = 1e-9;

// Whether a segment overlaps an axis-aligned box (Liang–Barsky slab clip; inclusive).
export function testSegmentAabbCollision(a: Readonly<CollisionSegment2D>, b: Readonly<CollisionAabb2D>): boolean {
  return isSegmentOverlappingBox(a.x0, a.y0, a.x1, a.y1, b.minX, b.minY, b.maxX, b.maxY);
}

// Whether a segment overlaps a circle (nearest point on the segment within the radius; inclusive).
export function testSegmentCircleCollision(a: Readonly<CollisionSegment2D>, b: Readonly<CollisionCircle2D>): boolean {
  const x0 = a.x0;
  const y0 = a.y0;
  const dx = a.x1 - x0;
  const dy = a.y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((b.x - x0) * dx + (b.y - y0) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const closestX = x0 + t * dx;
  const closestY = y0 + t * dy;
  const ddx = b.x - closestX;
  const ddy = b.y - closestY;
  return ddx * ddx + ddy * ddy <= b.radius * b.radius;
}

// Whether a segment overlaps an oriented box (transformed into the box's local frame, then tested as
// segment-vs-AABB; inclusive).
export function testSegmentObbCollision(a: Readonly<CollisionSegment2D>, b: Readonly<CollisionObb2D>): boolean {
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);
  const d0x = a.x0 - b.x;
  const d0y = a.y0 - b.y;
  const d1x = a.x1 - b.x;
  const d1y = a.y1 - b.y;
  const localX0 = d0x * cos + d0y * sin;
  const localY0 = -d0x * sin + d0y * cos;
  const localX1 = d1x * cos + d1y * sin;
  const localY1 = -d1x * sin + d1y * cos;
  return isSegmentOverlappingBox(localX0, localY0, localX1, localY1, -b.halfW, -b.halfH, b.halfW, b.halfH);
}

// Whether a segment overlaps a convex polygon: true if either endpoint is inside, or the segment
// crosses any polygon edge (inclusive). The polygon is assumed convex.
export function testSegmentPolygonCollision(a: Readonly<CollisionSegment2D>, b: Readonly<CollisionPolygon2D>): boolean {
  const points = b.points;
  if (getCollisionPolygonValidationStatus2D(points) !== null) return false;
  const pn = points.length >> 1;
  if (isPointInConvexPolygon(a.x0, a.y0, points, pn)) return true;
  if (isPointInConvexPolygon(a.x1, a.y1, points, pn)) return true;
  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    if (
      isSegmentsIntersecting(
        a.x0,
        a.y0,
        a.x1,
        a.y1,
        points[i << 1],
        points[(i << 1) + 1],
        points[j << 1],
        points[(j << 1) + 1],
      )
    ) {
      return true;
    }
  }
  return false;
}

// Whether two segments intersect, including touching endpoints and collinear overlap (inclusive).
export function testSegmentSegmentCollision(a: Readonly<CollisionSegment2D>, b: Readonly<CollisionSegment2D>): boolean {
  return isSegmentsIntersecting(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1);
}

// Convex point-in-polygon by sign consistency of the edge cross products (winding-agnostic,
// boundary-inclusive). `pn` is the vertex count.
function isPointInConvexPolygon(x: number, y: number, px: readonly number[], pn: number): boolean {
  const epsilon = relativeEpsilon(getPolygonExtent(px, pn));
  let positive = false;
  let negative = false;
  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
    const edgeEpsilon = Math.hypot(x1 - x0, y1 - y0) * epsilon;
    if (cross > edgeEpsilon) positive = true;
    else if (cross < -edgeEpsilon) negative = true;
    if (positive && negative) return false;
  }
  return true;
}

// Whether segment (a0,a1) intersects segment (b0,b1). Handles the parallel/collinear cases by
// projecting onto the first segment and testing interval overlap.
function isSegmentsIntersecting(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): boolean {
  const d1x = ax1 - ax0;
  const d1y = ay1 - ay0;
  const d2x = bx1 - bx0;
  const d2y = by1 - by0;
  const denom = d1x * d2y - d1y * d2x;
  const ex = bx0 - ax0;
  const ey = by0 - ay0;
  const d1LengthSquared = d1x * d1x + d1y * d1y;
  const d2LengthSquared = d2x * d2x + d2y * d2y;

  if (d1LengthSquared === 0) {
    return isPointOnSegment(ax0, ay0, bx0, by0, bx1, by1);
  }
  if (d2LengthSquared === 0) {
    return isPointOnSegment(bx0, by0, ax0, ay0, ax1, ay1);
  }

  if (denom * denom <= RELATIVE_EPSILON * RELATIVE_EPSILON * d1LengthSquared * d2LengthSquared) {
    // Parallel; intersect only if collinear and their projections onto d1 overlap.
    const epsilon = relativeEpsilon(Math.max(Math.sqrt(d1LengthSquared), Math.sqrt(d2LengthSquared)));
    if (Math.abs(ex * d1y - ey * d1x) > Math.sqrt(d1LengthSquared) * epsilon) return false;
    const t0 = (ex * d1x + ey * d1y) / d1LengthSquared;
    const t1 = ((bx1 - ax0) * d1x + (by1 - ay0) * d1y) / d1LengthSquared;
    const lo = t0 < t1 ? t0 : t1;
    const hi = t0 < t1 ? t1 : t0;
    return hi >= -RELATIVE_EPSILON && lo <= 1 + RELATIVE_EPSILON;
  }

  const t = (ex * d2y - ey * d2x) / denom;
  const u = (ex * d1y - ey * d1x) / denom;
  return t >= -RELATIVE_EPSILON && t <= 1 + RELATIVE_EPSILON && u >= -RELATIVE_EPSILON && u <= 1 + RELATIVE_EPSILON;
}

// Liang–Barsky segment-vs-AABB overlap (inclusive). Clips the segment parameter to [0,1] against the
// four box slabs; overlap survives when the clipped interval stays non-empty.
function isSegmentOverlappingBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const epsilon = relativeEpsilon(Math.max(Math.abs(dx), Math.abs(dy), maxX - minX, maxY - minY));
  clipRange.t0 = 0;
  clipRange.t1 = 1;

  // Each slab contributes a `p*t <= q` constraint; `p === 0` means the segment is parallel to it.
  if (!clipSegmentSlab(-dx, x0 - minX, epsilon)) return false;
  if (!clipSegmentSlab(dx, maxX - x0, epsilon)) return false;
  if (!clipSegmentSlab(-dy, y0 - minY, epsilon)) return false;
  if (!clipSegmentSlab(dy, maxY - y0, epsilon)) return false;
  return clipRange.t0 <= clipRange.t1;
}

// Narrows the shared clip range against one Liang–Barsky slab constraint `p*t <= q`. Returns false
// when the constraint rejects the whole segment. Mutates `clipRange` in place (no allocation).
function clipSegmentSlab(p: number, q: number, epsilon: number): boolean {
  if (Math.abs(p) <= epsilon) {
    return q >= -epsilon;
  }
  const r = q / p;
  if (p < 0) {
    if (r > clipRange.t1) return false;
    if (r > clipRange.t0) clipRange.t0 = r;
  } else {
    if (r < clipRange.t0) return false;
    if (r < clipRange.t1) clipRange.t1 = r;
  }
  return true;
}

function getPolygonExtent(points: readonly number[], count: number): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = points[i << 1];
    const y = points[(i << 1) + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

function isPointOnSegment(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return x === x0 && y === y0;
  let t = ((x - x0) * dx + (y - y0) * dy) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ddx = x - (x0 + t * dx);
  const ddy = y - (y0 + t * dy);
  const epsilon = relativeEpsilon(Math.sqrt(lengthSquared));
  return ddx * ddx + ddy * ddy <= epsilon * epsilon;
}

function relativeEpsilon(extent: number): number {
  return extent > 0 ? extent * RELATIVE_EPSILON : Number.EPSILON;
}

const clipRange = { t0: 0, t1: 1 };
