import { createVector2, normalizeVector2 } from '@flighthq/geometry';
import type {
  CollisionAabb,
  CollisionCircle,
  CollisionManifold,
  CollisionObb,
  CollisionPolygon,
} from '@flighthq/types';

import { clearCollisionManifold } from './manifold';

// The 2D narrow-phase pair tests. Each writes an `out` CollisionManifold and returns whether the
// pair overlaps. On overlap the manifold normal is the unit minimum-translation axis oriented to
// push shape **A** (the first argument) out of **B**, with `depth` the penetration along it; on a
// miss the manifold is cleared. Touching (zero penetration) counts as **not** overlapping.
//
// AABB/OBB/convex-polygon pairs route through a single separating-axis (SAT) core over materialized
// vertex lists; circle pairs are special-cased with closest-point / radial math (SAT does not model
// a circle's infinite axis set). The hot path allocates nothing: box vertices are written into
// module-level scratch buffers and the manifold is written last, after all inputs are read.
//
// Polygons are assumed convex; `points` is a flat `[x0,y0,...]` list. Winding does not matter — the
// core orients the manifold by comparing shape centroids.

const EPS = 1e-9;

// Axis-aligned box vs axis-aligned box. Direct min-overlap test (no SAT needed): the only candidate
// separating axes are X and Y, and the manifold uses whichever has the smaller penetration.
export function testAabbAabbCollision(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionAabb>,
  out: CollisionManifold,
): boolean {
  const aMinX = a.minX;
  const aMinY = a.minY;
  const aMaxX = a.maxX;
  const aMaxY = a.maxY;
  const bMinX = b.minX;
  const bMinY = b.minY;
  const bMaxX = b.maxX;
  const bMaxY = b.maxY;

  // Penetration = the smaller of the two ways to separate along each axis (handles containment,
  // where the intersection length would understate the distance needed to push the boxes apart).
  const penLeftX = aMaxX - bMinX;
  const penRightX = bMaxX - aMinX;
  const overlapX = penLeftX < penRightX ? penLeftX : penRightX;
  const penDownY = aMaxY - bMinY;
  const penUpY = bMaxY - aMinY;
  const overlapY = penDownY < penUpY ? penDownY : penUpY;
  if (overlapX <= 0 || overlapY <= 0) {
    clearCollisionManifold(out);
    return false;
  }

  if (overlapX < overlapY) {
    out.normalX = penLeftX < penRightX ? -1 : 1;
    out.normalY = 0;
    out.depth = overlapX;
  } else {
    out.normalX = 0;
    out.normalY = penDownY < penUpY ? -1 : 1;
    out.depth = overlapY;
  }
  out.overlapping = true;
  return true;
}

// Axis-aligned box vs oriented box (SAT over both boxes' four corners).
export function testAabbObbCollision(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionObb>,
  out: CollisionManifold,
): boolean {
  writeAabbVertices(a, scratchA);
  writeObbVertices(b, scratchB);
  return satConvexOverlap(scratchA, 4, scratchB, 4, out);
}

// Axis-aligned box vs convex polygon (SAT).
export function testAabbPolygonCollision(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionPolygon>,
  out: CollisionManifold,
): boolean {
  writeAabbVertices(a, scratchA);
  const bPoints = b.points;
  return satConvexOverlap(scratchA, 4, bPoints, bPoints.length >> 1, out);
}

// Circle vs axis-aligned box. Closest-point when the center is outside the box; nearest-face
// push-out when the center is inside it.
export function testCircleAabbCollision(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionAabb>,
  out: CollisionManifold,
): boolean {
  return circleAabbOverlap(a.x, a.y, a.radius, b.minX, b.minY, b.maxX, b.maxY, out);
}

// Circle vs circle. Radial: overlapping when the centers are closer than the radius sum; the normal
// points from B's center to A's center. Concentric centers fall back to a +X normal at full depth.
export function testCircleCircleCollision(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionCircle>,
  out: CollisionManifold,
): boolean {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const radiusSum = a.radius + b.radius;

  const dx = ax - bx;
  const dy = ay - by;
  const distSquared = dx * dx + dy * dy;
  if (distSquared >= radiusSum * radiusSum) {
    clearCollisionManifold(out);
    return false;
  }

  const dist = Math.sqrt(distSquared);
  if (dist > EPS) {
    const inv = 1 / dist;
    out.normalX = dx * inv;
    out.normalY = dy * inv;
    out.depth = radiusSum - dist;
  } else {
    out.normalX = 1;
    out.normalY = 0;
    out.depth = radiusSum;
  }
  out.overlapping = true;
  return true;
}

// Circle vs oriented box. The circle center is transformed into the box's local frame, tested as
// circle-vs-AABB there, then the resulting normal is rotated back into world space.
export function testCircleObbCollision(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionObb>,
  out: CollisionManifold,
): boolean {
  const cx = a.x;
  const cy = a.y;
  const radius = a.radius;
  const halfW = b.halfW;
  const halfH = b.halfH;
  const cos = Math.cos(b.rotation);
  const sin = Math.sin(b.rotation);

  const dx = cx - b.x;
  const dy = cy - b.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  if (!circleAabbOverlap(localX, localY, radius, -halfW, -halfH, halfW, halfH, out)) {
    return false;
  }

  const localNormalX = out.normalX;
  const localNormalY = out.normalY;
  out.normalX = localNormalX * cos - localNormalY * sin;
  out.normalY = localNormalX * sin + localNormalY * cos;
  return true;
}

// Circle vs convex polygon (SAT: polygon edge normals plus the axis from the circle center to its
// nearest polygon vertex, the axis SAT would otherwise miss at a corner).
export function testCirclePolygonCollision(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionPolygon>,
  out: CollisionManifold,
): boolean {
  const points = b.points;
  return satCircleConvexOverlap(a.x, a.y, a.radius, points, points.length >> 1, out);
}

// Oriented box vs oriented box (SAT over both boxes' four corners).
export function testObbObbCollision(
  a: Readonly<CollisionObb>,
  b: Readonly<CollisionObb>,
  out: CollisionManifold,
): boolean {
  writeObbVertices(a, scratchA);
  writeObbVertices(b, scratchB);
  return satConvexOverlap(scratchA, 4, scratchB, 4, out);
}

// Oriented box vs convex polygon (SAT).
export function testObbPolygonCollision(
  a: Readonly<CollisionObb>,
  b: Readonly<CollisionPolygon>,
  out: CollisionManifold,
): boolean {
  writeObbVertices(a, scratchA);
  const bPoints = b.points;
  return satConvexOverlap(scratchA, 4, bPoints, bPoints.length >> 1, out);
}

// Convex polygon vs convex polygon (SAT — the general convex core).
export function testPolygonPolygonCollision(
  a: Readonly<CollisionPolygon>,
  b: Readonly<CollisionPolygon>,
  out: CollisionManifold,
): boolean {
  const aPoints = a.points;
  const bPoints = b.points;
  return satConvexOverlap(aPoints, aPoints.length >> 1, bPoints, bPoints.length >> 1, out);
}

// Circle (`cx`,`cy`,`radius`) vs axis-aligned box given as min/max. Writes the manifold pushing the
// circle out of the box. Shared by the circle-AABB and circle-OBB (local-frame) entry points.
function circleAabbOverlap(
  cx: number,
  cy: number,
  radius: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  out: CollisionManifold,
): boolean {
  const closestX = cx < minX ? minX : cx > maxX ? maxX : cx;
  const closestY = cy < minY ? minY : cy > maxY ? maxY : cy;
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSquared = dx * dx + dy * dy;

  if (distSquared > EPS * EPS) {
    // Center outside the box: separate along the closest-point direction.
    const dist = Math.sqrt(distSquared);
    if (dist >= radius) {
      clearCollisionManifold(out);
      return false;
    }
    const inv = 1 / dist;
    out.normalX = dx * inv;
    out.normalY = dy * inv;
    out.depth = radius - dist;
    out.overlapping = true;
    return true;
  }

  // Center inside the box: push out through the nearest face.
  const left = cx - minX;
  const right = maxX - cx;
  const bottom = cy - minY;
  const top = maxY - cy;
  let min = left;
  let normalX = -1;
  let normalY = 0;
  if (right < min) {
    min = right;
    normalX = 1;
    normalY = 0;
  }
  if (bottom < min) {
    min = bottom;
    normalX = 0;
    normalY = -1;
  }
  if (top < min) {
    min = top;
    normalX = 0;
    normalY = 1;
  }
  out.normalX = normalX;
  out.normalY = normalY;
  out.depth = min + radius;
  out.overlapping = true;
  return true;
}

// SAT for a circle vs a convex polygon. Tests every polygon edge normal plus the center-to-nearest-
// vertex axis, tracking the least-penetration axis. Orients the normal from the polygon toward the
// circle so it pushes the circle out.
function satCircleConvexOverlap(
  cx: number,
  cy: number,
  radius: number,
  px: ArrayLike<number>,
  pn: number,
  out: CollisionManifold,
): boolean {
  let minOverlap = Infinity;
  let normalX = 0;
  let normalY = 0;

  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    scratchAxis.x = y1 - y0;
    scratchAxis.y = -(x1 - x0);
    const len = normalizeVector2(scratchAxis, scratchAxis);
    if (len < EPS) continue;
    const axisX = scratchAxis.x;
    const axisY = scratchAxis.y;
    const overlap = circlePolygonAxisOverlap(axisX, axisY, cx, cy, radius, px, pn);
    if (overlap <= 0) {
      clearCollisionManifold(out);
      return false;
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      normalX = axisX;
      normalY = axisY;
    }
  }

  // Center-to-nearest-vertex axis (the corner case a pure edge-normal test misses).
  let nearestX = 0;
  let nearestY = 0;
  let nearestDistSquared = Infinity;
  for (let i = 0; i < pn; i++) {
    const vx = px[i << 1];
    const vy = px[(i << 1) + 1];
    const ddx = cx - vx;
    const ddy = cy - vy;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < nearestDistSquared) {
      nearestDistSquared = d2;
      nearestX = vx;
      nearestY = vy;
    }
  }
  scratchAxis.x = cx - nearestX;
  scratchAxis.y = cy - nearestY;
  const vertexAxisLen = normalizeVector2(scratchAxis, scratchAxis);
  if (vertexAxisLen > EPS) {
    const axisX = scratchAxis.x;
    const axisY = scratchAxis.y;
    const overlap = circlePolygonAxisOverlap(axisX, axisY, cx, cy, radius, px, pn);
    if (overlap <= 0) {
      clearCollisionManifold(out);
      return false;
    }
    if (overlap < minOverlap) {
      minOverlap = overlap;
      normalX = axisX;
      normalY = axisY;
    }
  }

  if (minOverlap === Infinity) {
    clearCollisionManifold(out);
    return false;
  }

  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < pn; i++) {
    centroidX += px[i << 1];
    centroidY += px[(i << 1) + 1];
  }
  centroidX /= pn;
  centroidY /= pn;
  if (normalX * (cx - centroidX) + normalY * (cy - centroidY) < 0) {
    normalX = -normalX;
    normalY = -normalY;
  }

  out.normalX = normalX;
  out.normalY = normalY;
  out.depth = minOverlap;
  out.overlapping = true;
  return true;
}

// Penetration of a circle and a polygon along one unit axis, or a non-positive value if they are
// separated (or merely touching) on it.
function circlePolygonAxisOverlap(
  axisX: number,
  axisY: number,
  cx: number,
  cy: number,
  radius: number,
  px: ArrayLike<number>,
  pn: number,
): number {
  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < pn; i++) {
    const d = px[i << 1] * axisX + px[(i << 1) + 1] * axisY;
    if (d < minP) minP = d;
    if (d > maxP) maxP = d;
  }
  const c = cx * axisX + cy * axisY;
  const cMin = c - radius;
  const cMax = c + radius;
  // Separation penetration (min of the two push directions), not the intersection length.
  const penLow = maxP - cMin;
  const penHigh = cMax - minP;
  return penLow < penHigh ? penLow : penHigh;
}

// SAT for two convex polygons given as flat vertex lists. Tests each polygon's edge normals,
// tracking the least-penetration separating axis, and orients the normal to push A out of B.
function satConvexOverlap(
  ax: ArrayLike<number>,
  an: number,
  bx: ArrayLike<number>,
  bn: number,
  out: CollisionManifold,
): boolean {
  minOverlapAxis.overlap = Infinity;
  minOverlapAxis.x = 0;
  minOverlapAxis.y = 0;
  if (!accumulatePolygonAxes(ax, an, ax, an, bx, bn, out)) return false;
  if (!accumulatePolygonAxes(bx, bn, ax, an, bx, bn, out)) return false;
  if (minOverlapAxis.overlap === Infinity) {
    clearCollisionManifold(out);
    return false;
  }

  let aCentroidX = 0;
  let aCentroidY = 0;
  for (let i = 0; i < an; i++) {
    aCentroidX += ax[i << 1];
    aCentroidY += ax[(i << 1) + 1];
  }
  aCentroidX /= an;
  aCentroidY /= an;
  let bCentroidX = 0;
  let bCentroidY = 0;
  for (let i = 0; i < bn; i++) {
    bCentroidX += bx[i << 1];
    bCentroidY += bx[(i << 1) + 1];
  }
  bCentroidX /= bn;
  bCentroidY /= bn;

  let normalX = minOverlapAxis.x;
  let normalY = minOverlapAxis.y;
  if (normalX * (aCentroidX - bCentroidX) + normalY * (aCentroidY - bCentroidY) < 0) {
    normalX = -normalX;
    normalY = -normalY;
  }
  out.normalX = normalX;
  out.normalY = normalY;
  out.depth = minOverlapAxis.overlap;
  out.overlapping = true;
  return true;
}

// Tests every edge normal of the source polygon (`sx`,`sn`) as a separating axis for the pair
// (`ax`/`bx`), updating the tracked least-penetration axis. Returns false (and clears `out`) as soon
// as a separating axis with no positive overlap is found.
function accumulatePolygonAxes(
  sx: ArrayLike<number>,
  sn: number,
  ax: ArrayLike<number>,
  an: number,
  bx: ArrayLike<number>,
  bn: number,
  out: CollisionManifold,
): boolean {
  for (let i = 0; i < sn; i++) {
    const j = (i + 1) % sn;
    const x0 = sx[i << 1];
    const y0 = sx[(i << 1) + 1];
    const x1 = sx[j << 1];
    const y1 = sx[(j << 1) + 1];
    scratchAxis.x = y1 - y0;
    scratchAxis.y = -(x1 - x0);
    const len = normalizeVector2(scratchAxis, scratchAxis);
    if (len < EPS) continue;
    const axisX = scratchAxis.x;
    const axisY = scratchAxis.y;
    const overlap = polygonAxisOverlap(axisX, axisY, ax, an, bx, bn);
    if (overlap <= 0) {
      clearCollisionManifold(out);
      return false;
    }
    if (overlap < minOverlapAxis.overlap) {
      minOverlapAxis.overlap = overlap;
      minOverlapAxis.x = axisX;
      minOverlapAxis.y = axisY;
    }
  }
  return true;
}

// Penetration of two polygons' projections onto one unit axis, or a non-positive value if they are
// separated (or merely touching) on it.
function polygonAxisOverlap(
  axisX: number,
  axisY: number,
  ax: ArrayLike<number>,
  an: number,
  bx: ArrayLike<number>,
  bn: number,
): number {
  let minA = Infinity;
  let maxA = -Infinity;
  for (let i = 0; i < an; i++) {
    const d = ax[i << 1] * axisX + ax[(i << 1) + 1] * axisY;
    if (d < minA) minA = d;
    if (d > maxA) maxA = d;
  }
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < bn; i++) {
    const d = bx[i << 1] * axisX + bx[(i << 1) + 1] * axisY;
    if (d < minB) minB = d;
    if (d > maxB) maxB = d;
  }
  // Separation penetration (min of the two push directions), not the intersection length.
  const penLow = maxA - minB;
  const penHigh = maxB - minA;
  return penLow < penHigh ? penLow : penHigh;
}

// Writes the four corners of an axis-aligned box into `out` as a flat `[x0,y0,...]` list.
function writeAabbVertices(aabb: Readonly<CollisionAabb>, out: Float64Array): void {
  const minX = aabb.minX;
  const minY = aabb.minY;
  const maxX = aabb.maxX;
  const maxY = aabb.maxY;
  out[0] = minX;
  out[1] = minY;
  out[2] = maxX;
  out[3] = minY;
  out[4] = maxX;
  out[5] = maxY;
  out[6] = minX;
  out[7] = maxY;
}

// Writes the four world-space corners of an oriented box into `out` as a flat `[x0,y0,...]` list.
function writeObbVertices(obb: Readonly<CollisionObb>, out: Float64Array): void {
  const cx = obb.x;
  const cy = obb.y;
  const halfW = obb.halfW;
  const halfH = obb.halfH;
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  const wx = cos * halfW;
  const wy = sin * halfW;
  const hx = -sin * halfH;
  const hy = cos * halfH;
  out[0] = cx - wx - hx;
  out[1] = cy - wy - hy;
  out[2] = cx + wx - hx;
  out[3] = cy + wy - hy;
  out[4] = cx + wx + hx;
  out[5] = cy + wy + hy;
  out[6] = cx - wx + hx;
  out[7] = cy - wy + hy;
}

const scratchA = new Float64Array(8);
const scratchB = new Float64Array(8);
const scratchAxis = createVector2();
const minOverlapAxis = { overlap: Infinity, x: 0, y: 0 };
