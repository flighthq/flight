import { createVector2, normalizeVector2 } from '@flighthq/geometry/contract';
import type {
  CollisionAabb2D,
  CollisionCircle2D,
  CollisionManifold2D,
  CollisionObb2D,
  CollisionPolygon2D,
} from '@flighthq/types/contract';

import { getCollisionPolygonValidationStatus2D } from './collisionShapeValidation';
import { writeAabbVertices, writeObbVertices } from './convexVertices';
import { clearCollisionManifold2D } from './manifold';

// The 2D narrow-phase pair tests. Each writes an `out` CollisionManifold2D and returns whether the
// pair overlaps. On overlap the manifold normal is the unit minimum-translation axis oriented to
// push shape **A** (the first argument) out of **B**, with `depth` the penetration along it; on a
// miss the manifold is cleared. Touching (zero penetration) counts as **not** overlapping.
//
// AABB/OBB/convex-polygon pairs route through a single separating-axis (SAT) core over materialized
// vertex lists; circle pairs are special-cased with closest-point / radial math (SAT does not model
// a circle's infinite axis set). The hot path allocates nothing: box vertices are written into
// exclusively leased scratch buffers and the manifold is written last, after all inputs are read.
//
// Polygons are assumed convex; `points` is a flat `[x0,y0,...]` list. Winding does not matter — the
// core orients the manifold by comparing shape centroids.

const RELATIVE_EPSILON = 1e-9;

// Axis-aligned box vs axis-aligned box. Direct min-overlap test (no SAT needed): the only candidate
// separating axes are X and Y, and the manifold uses whichever has the smaller penetration.
export function testAabbAabbCollision(
  a: Readonly<CollisionAabb2D>,
  b: Readonly<CollisionAabb2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidAabb(a) || !isValidAabb(b)) return clearInvalidCollisionManifold(out);
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
    clearCollisionManifold2D(out);
    return false;
  }

  if (overlapX <= overlapY) {
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
  a: Readonly<CollisionAabb2D>,
  b: Readonly<CollisionObb2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidAabb(a) || !isValidObb(b)) return clearInvalidCollisionManifold(out);
  const scratch = acquireShapeCollisionScratch();
  try {
    writeAabbVertices(a, scratch.verticesA);
    writeObbVertices(b, scratch.verticesB);
    return satConvexOverlap(scratch.verticesA, 4, scratch.verticesB, 4, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
}

// Axis-aligned box vs convex polygon (SAT).
export function testAabbPolygonCollision(
  a: Readonly<CollisionAabb2D>,
  b: Readonly<CollisionPolygon2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidAabb(a) || getCollisionPolygonValidationStatus2D(b.points) !== null) {
    return clearInvalidCollisionManifold(out);
  }
  const bPoints = b.points;
  const scratch = acquireShapeCollisionScratch();
  try {
    writeAabbVertices(a, scratch.verticesA);
    return satConvexOverlap(scratch.verticesA, 4, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
}

// Circle vs axis-aligned box. Closest-point when the center is outside the box; nearest-face
// push-out when the center is inside it.
export function testCircleAabbCollision(
  a: Readonly<CollisionCircle2D>,
  b: Readonly<CollisionAabb2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidCircle(a) || !isValidAabb(b)) return clearInvalidCollisionManifold(out);
  return circleAabbOverlap(a.x, a.y, a.radius, b.minX, b.minY, b.maxX, b.maxY, out);
}

// Circle vs circle. Radial: overlapping when the centers are closer than the radius sum; the normal
// points from B's center to A's center. Concentric centers fall back to a +X normal at full depth.
export function testCircleCircleCollision(
  a: Readonly<CollisionCircle2D>,
  b: Readonly<CollisionCircle2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidCircle(a) || !isValidCircle(b)) return clearInvalidCollisionManifold(out);
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const radiusSum = a.radius + b.radius;

  const dx = ax - bx;
  const dy = ay - by;
  const distSquared = dx * dx + dy * dy;
  if (distSquared >= radiusSum * radiusSum) {
    clearCollisionManifold2D(out);
    return false;
  }

  const dist = Math.sqrt(distSquared);
  if (dist > relativeEpsilon(radiusSum)) {
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
  a: Readonly<CollisionCircle2D>,
  b: Readonly<CollisionObb2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidCircle(a) || !isValidObb(b)) return clearInvalidCollisionManifold(out);
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
  a: Readonly<CollisionCircle2D>,
  b: Readonly<CollisionPolygon2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidCircle(a) || getCollisionPolygonValidationStatus2D(b.points) !== null) {
    return clearInvalidCollisionManifold(out);
  }
  const points = b.points;
  const scratch = acquireShapeCollisionScratch();
  try {
    return satCircleConvexOverlap(a.x, a.y, a.radius, points, points.length >> 1, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
}

// Oriented box vs oriented box (SAT over both boxes' four corners).
export function testObbObbCollision(
  a: Readonly<CollisionObb2D>,
  b: Readonly<CollisionObb2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidObb(a) || !isValidObb(b)) return clearInvalidCollisionManifold(out);
  const scratch = acquireShapeCollisionScratch();
  try {
    writeObbVertices(a, scratch.verticesA);
    writeObbVertices(b, scratch.verticesB);
    return satConvexOverlap(scratch.verticesA, 4, scratch.verticesB, 4, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
}

// Oriented box vs convex polygon (SAT).
export function testObbPolygonCollision(
  a: Readonly<CollisionObb2D>,
  b: Readonly<CollisionPolygon2D>,
  out: CollisionManifold2D,
): boolean {
  if (!isValidObb(a) || getCollisionPolygonValidationStatus2D(b.points) !== null) {
    return clearInvalidCollisionManifold(out);
  }
  const bPoints = b.points;
  const scratch = acquireShapeCollisionScratch();
  try {
    writeObbVertices(a, scratch.verticesA);
    return satConvexOverlap(scratch.verticesA, 4, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
}

// Convex polygon vs convex polygon (SAT — the general convex core).
export function testPolygonPolygonCollision(
  a: Readonly<CollisionPolygon2D>,
  b: Readonly<CollisionPolygon2D>,
  out: CollisionManifold2D,
): boolean {
  if (
    getCollisionPolygonValidationStatus2D(a.points) !== null ||
    getCollisionPolygonValidationStatus2D(b.points) !== null
  ) {
    return clearInvalidCollisionManifold(out);
  }
  const aPoints = a.points;
  const bPoints = b.points;
  const scratch = acquireShapeCollisionScratch();
  try {
    return satConvexOverlap(aPoints, aPoints.length >> 1, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeCollisionScratch(scratch);
  }
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
  out: CollisionManifold2D,
): boolean {
  const closestX = cx < minX ? minX : cx > maxX ? maxX : cx;
  const closestY = cy < minY ? minY : cy > maxY ? maxY : cy;
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSquared = dx * dx + dy * dy;
  const epsilon = relativeEpsilon(Math.max(maxX - minX, maxY - minY, radius));

  if (distSquared > epsilon * epsilon) {
    // Center outside the box: separate along the closest-point direction.
    const dist = Math.sqrt(distSquared);
    if (dist >= radius) {
      clearCollisionManifold2D(out);
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
  let min = right;
  let normalX = 1;
  let normalY = 0;
  if (left < min) {
    min = left;
    normalX = -1;
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
  out.normalX = normalX === 0 ? 0 : normalX;
  out.normalY = normalY === 0 ? 0 : normalY;
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
  out: CollisionManifold2D,
  scratch: ShapeCollisionScratch,
): boolean {
  const epsilon = relativeEpsilon(Math.max(getPolygonExtent(px, pn), radius));
  let minOverlap = Infinity;
  let normalX = 0;
  let normalY = 0;

  for (let i = 0; i < pn; i++) {
    const j = (i + 1) % pn;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    const x1 = px[j << 1];
    const y1 = px[(j << 1) + 1];
    scratch.axis.x = y1 - y0;
    scratch.axis.y = -(x1 - x0);
    const len = normalizeVector2(scratch.axis, scratch.axis);
    if (len <= epsilon) continue;
    canonicalizeScratchAxis(scratch);
    const axisX = scratch.axis.x;
    const axisY = scratch.axis.y;
    const overlap = circlePolygonAxisOverlap(axisX, axisY, cx, cy, radius, px, pn);
    if (overlap <= epsilon) {
      clearCollisionManifold2D(out);
      return false;
    }
    if (isPreferredAxis(overlap, axisX, axisY, minOverlap, normalX, normalY, epsilon)) {
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
  scratch.axis.x = cx - nearestX;
  scratch.axis.y = cy - nearestY;
  const vertexAxisLen = normalizeVector2(scratch.axis, scratch.axis);
  if (vertexAxisLen > epsilon) {
    canonicalizeScratchAxis(scratch);
    const axisX = scratch.axis.x;
    const axisY = scratch.axis.y;
    const overlap = circlePolygonAxisOverlap(axisX, axisY, cx, cy, radius, px, pn);
    if (overlap <= epsilon) {
      clearCollisionManifold2D(out);
      return false;
    }
    if (isPreferredAxis(overlap, axisX, axisY, minOverlap, normalX, normalY, epsilon)) {
      minOverlap = overlap;
      normalX = axisX;
      normalY = axisY;
    }
  }

  if (minOverlap === Infinity) {
    clearCollisionManifold2D(out);
    return false;
  }

  const originX = px[0];
  const originY = px[1];
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < pn; i++) {
    centroidX += px[i << 1] - originX;
    centroidY += px[(i << 1) + 1] - originY;
  }
  centroidX /= pn;
  centroidY /= pn;
  if (normalX * (cx - originX - centroidX) + normalY * (cy - originY - centroidY) < -epsilon) {
    normalX = -normalX;
    normalY = -normalY;
  }

  out.normalX = normalX === 0 ? 0 : normalX;
  out.normalY = normalY === 0 ? 0 : normalY;
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
  const originX = px[0];
  const originY = px[1];
  let minP = Infinity;
  let maxP = -Infinity;
  for (let i = 0; i < pn; i++) {
    const d = (px[i << 1] - originX) * axisX + (px[(i << 1) + 1] - originY) * axisY;
    if (d < minP) minP = d;
    if (d > maxP) maxP = d;
  }
  const c = (cx - originX) * axisX + (cy - originY) * axisY;
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
  out: CollisionManifold2D,
  scratch: ShapeCollisionScratch,
): boolean {
  const epsilon = relativeEpsilon(Math.max(getPolygonExtent(ax, an), getPolygonExtent(bx, bn)));
  scratch.minOverlapAxis.overlap = Infinity;
  scratch.minOverlapAxis.x = 0;
  scratch.minOverlapAxis.y = 0;
  if (!accumulatePolygonAxes(ax, an, ax, an, bx, bn, epsilon, out, scratch)) return false;
  if (!accumulatePolygonAxes(bx, bn, ax, an, bx, bn, epsilon, out, scratch)) return false;
  if (scratch.minOverlapAxis.overlap === Infinity) {
    clearCollisionManifold2D(out);
    return false;
  }

  const originX = ax[0];
  const originY = ax[1];
  let aCentroidX = 0;
  let aCentroidY = 0;
  for (let i = 0; i < an; i++) {
    aCentroidX += ax[i << 1] - originX;
    aCentroidY += ax[(i << 1) + 1] - originY;
  }
  aCentroidX /= an;
  aCentroidY /= an;
  let bCentroidX = 0;
  let bCentroidY = 0;
  for (let i = 0; i < bn; i++) {
    bCentroidX += bx[i << 1] - originX;
    bCentroidY += bx[(i << 1) + 1] - originY;
  }
  bCentroidX /= bn;
  bCentroidY /= bn;

  let normalX = scratch.minOverlapAxis.x;
  let normalY = scratch.minOverlapAxis.y;
  if (normalX * (aCentroidX - bCentroidX) + normalY * (aCentroidY - bCentroidY) < -epsilon) {
    normalX = -normalX;
    normalY = -normalY;
  }
  out.normalX = normalX === 0 ? 0 : normalX;
  out.normalY = normalY === 0 ? 0 : normalY;
  out.depth = scratch.minOverlapAxis.overlap;
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
  epsilon: number,
  out: CollisionManifold2D,
  scratch: ShapeCollisionScratch,
): boolean {
  for (let i = 0; i < sn; i++) {
    const j = (i + 1) % sn;
    const x0 = sx[i << 1];
    const y0 = sx[(i << 1) + 1];
    const x1 = sx[j << 1];
    const y1 = sx[(j << 1) + 1];
    scratch.axis.x = y1 - y0;
    scratch.axis.y = -(x1 - x0);
    const len = normalizeVector2(scratch.axis, scratch.axis);
    if (len <= epsilon) continue;
    canonicalizeScratchAxis(scratch);
    const axisX = scratch.axis.x;
    const axisY = scratch.axis.y;
    const overlap = polygonAxisOverlap(axisX, axisY, ax, an, bx, bn);
    if (overlap <= epsilon) {
      clearCollisionManifold2D(out);
      return false;
    }
    if (
      isPreferredAxis(
        overlap,
        axisX,
        axisY,
        scratch.minOverlapAxis.overlap,
        scratch.minOverlapAxis.x,
        scratch.minOverlapAxis.y,
        epsilon,
      )
    ) {
      scratch.minOverlapAxis.overlap = overlap;
      scratch.minOverlapAxis.x = axisX;
      scratch.minOverlapAxis.y = axisY;
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
  const originX = ax[0];
  const originY = ax[1];
  let minA = Infinity;
  let maxA = -Infinity;
  for (let i = 0; i < an; i++) {
    const d = (ax[i << 1] - originX) * axisX + (ax[(i << 1) + 1] - originY) * axisY;
    if (d < minA) minA = d;
    if (d > maxA) maxA = d;
  }
  let minB = Infinity;
  let maxB = -Infinity;
  for (let i = 0; i < bn; i++) {
    const d = (bx[i << 1] - originX) * axisX + (bx[(i << 1) + 1] - originY) * axisY;
    if (d < minB) minB = d;
    if (d > maxB) maxB = d;
  }
  // Separation penetration (min of the two push directions), not the intersection length.
  const penLow = maxA - minB;
  const penHigh = maxB - minA;
  return penLow < penHigh ? penLow : penHigh;
}

function canonicalizeScratchAxis(scratch: ShapeCollisionScratch): void {
  if (scratch.axis.x < -RELATIVE_EPSILON || (Math.abs(scratch.axis.x) <= RELATIVE_EPSILON && scratch.axis.y < 0)) {
    scratch.axis.x = -scratch.axis.x;
    scratch.axis.y = -scratch.axis.y;
  }
}

function clearInvalidCollisionManifold(out: CollisionManifold2D): false {
  clearCollisionManifold2D(out);
  return false;
}

function getPolygonExtent(points: ArrayLike<number>, count: number): number {
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

function isPreferredAxis(
  overlap: number,
  axisX: number,
  axisY: number,
  currentOverlap: number,
  currentX: number,
  currentY: number,
  epsilon: number,
): boolean {
  if (overlap < currentOverlap - epsilon) return true;
  if (Math.abs(overlap - currentOverlap) > epsilon) return false;
  if (axisX > currentX + RELATIVE_EPSILON) return true;
  return Math.abs(axisX - currentX) <= RELATIVE_EPSILON && axisY > currentY;
}

function isValidAabb(shape: Readonly<CollisionAabb2D>): boolean {
  return (
    Number.isFinite(shape.minX) &&
    Number.isFinite(shape.minY) &&
    Number.isFinite(shape.maxX) &&
    Number.isFinite(shape.maxY) &&
    shape.maxX > shape.minX &&
    shape.maxY > shape.minY
  );
}

function isValidCircle(shape: Readonly<CollisionCircle2D>): boolean {
  return Number.isFinite(shape.x) && Number.isFinite(shape.y) && Number.isFinite(shape.radius) && shape.radius > 0;
}

function isValidObb(shape: Readonly<CollisionObb2D>): boolean {
  return (
    Number.isFinite(shape.x) &&
    Number.isFinite(shape.y) &&
    Number.isFinite(shape.halfW) &&
    Number.isFinite(shape.halfH) &&
    Number.isFinite(shape.rotation) &&
    shape.halfW > 0 &&
    shape.halfH > 0
  );
}

function relativeEpsilon(extent: number): number {
  return extent > 0 ? extent * RELATIVE_EPSILON : Number.EPSILON;
}

interface ShapeCollisionScratch {
  verticesA: Float64Array;
  verticesB: Float64Array;
  axis: ReturnType<typeof createVector2>;
  minOverlapAxis: { overlap: number; x: number; y: number };
}

function acquireShapeCollisionScratch(): ShapeCollisionScratch {
  return shapeCollisionScratchPool.pop() ?? createShapeCollisionScratch();
}

function createShapeCollisionScratch(): ShapeCollisionScratch {
  return {
    verticesA: new Float64Array(8),
    verticesB: new Float64Array(8),
    axis: createVector2(),
    minOverlapAxis: { overlap: Infinity, x: 0, y: 0 },
  };
}

function releaseShapeCollisionScratch(scratch: ShapeCollisionScratch): void {
  shapeCollisionScratchPool.push(scratch);
}

const shapeCollisionScratchPool: ShapeCollisionScratch[] = [createShapeCollisionScratch()];
