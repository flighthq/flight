import type { CollisionAabb, CollisionCircle, CollisionObb, CollisionPolygon, CollisionSegment } from '@flighthq/types';

// Segment-vs-shape overlap queries. Segments are area-less, so these return a boolean rather than a
// manifold (a swept/contact answer is a later phase). All are boundary-inclusive: a segment that
// just grazes a shape counts as overlapping.

const EPS = 1e-9;

// Whether a segment overlaps an axis-aligned box (Liang–Barsky slab clip; inclusive).
export function testSegmentAabbCollision(a: Readonly<CollisionSegment>, b: Readonly<CollisionAabb>): boolean {
  return isSegmentOverlappingBox(a.x0, a.y0, a.x1, a.y1, b.minX, b.minY, b.maxX, b.maxY);
}

// Whether a segment overlaps a circle (nearest point on the segment within the radius; inclusive).
export function testSegmentCircleCollision(a: Readonly<CollisionSegment>, b: Readonly<CollisionCircle>): boolean {
  const x0 = a.x0;
  const y0 = a.y0;
  const dx = a.x1 - x0;
  const dy = a.y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > EPS) {
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
export function testSegmentObbCollision(a: Readonly<CollisionSegment>, b: Readonly<CollisionObb>): boolean {
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
export function testSegmentPolygonCollision(a: Readonly<CollisionSegment>, b: Readonly<CollisionPolygon>): boolean {
  const points = b.points;
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
export function testSegmentSegmentCollision(a: Readonly<CollisionSegment>, b: Readonly<CollisionSegment>): boolean {
  return isSegmentsIntersecting(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1);
}

// Convex point-in-polygon by sign consistency of the edge cross products (winding-agnostic,
// boundary-inclusive). `pn` is the vertex count.
function isPointInConvexPolygon(x: number, y: number, px: readonly number[], pn: number): boolean {
  let positive = false;
  let negative = false;
  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    const cross = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
    if (cross > EPS) positive = true;
    else if (cross < -EPS) negative = true;
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

  if (Math.abs(denom) < EPS) {
    // Parallel; intersect only if collinear and their projections onto d1 overlap.
    if (Math.abs(ex * d1y - ey * d1x) > EPS) return false;
    const lengthSquared = d1x * d1x + d1y * d1y;
    if (lengthSquared < EPS) {
      // Segment A is degenerate (a point): true if it lies on B.
      const bLengthSquared = d2x * d2x + d2y * d2y;
      if (bLengthSquared < EPS) {
        return Math.abs(ex) < EPS && Math.abs(ey) < EPS;
      }
      let tb = ((ax0 - bx0) * d2x + (ay0 - by0) * d2y) / bLengthSquared;
      tb = tb < 0 ? 0 : tb > 1 ? 1 : tb;
      const qx = bx0 + tb * d2x;
      const qy = by0 + tb * d2y;
      return (ax0 - qx) * (ax0 - qx) + (ay0 - qy) * (ay0 - qy) < EPS;
    }
    const t0 = (ex * d1x + ey * d1y) / lengthSquared;
    const t1 = ((bx1 - ax0) * d1x + (by1 - ay0) * d1y) / lengthSquared;
    const lo = t0 < t1 ? t0 : t1;
    const hi = t0 < t1 ? t1 : t0;
    return hi >= -EPS && lo <= 1 + EPS;
  }

  const t = (ex * d2y - ey * d2x) / denom;
  const u = (ex * d1y - ey * d1x) / denom;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS;
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
  clipRange.t0 = 0;
  clipRange.t1 = 1;

  // Each slab contributes a `p*t <= q` constraint; `p === 0` means the segment is parallel to it.
  if (!clipSegmentSlab(-dx, x0 - minX)) return false;
  if (!clipSegmentSlab(dx, maxX - x0)) return false;
  if (!clipSegmentSlab(-dy, y0 - minY)) return false;
  if (!clipSegmentSlab(dy, maxY - y0)) return false;
  return clipRange.t0 <= clipRange.t1;
}

// Narrows the shared clip range against one Liang–Barsky slab constraint `p*t <= q`. Returns false
// when the constraint rejects the whole segment. Mutates `clipRange` in place (no allocation).
function clipSegmentSlab(p: number, q: number): boolean {
  if (Math.abs(p) < EPS) {
    return q >= 0;
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

const clipRange = { t0: 0, t1: 1 };
