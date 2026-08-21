import type {
  CollisionAabb2D,
  CollisionCapsule2D,
  CollisionCircle2D,
  CollisionContactManifold2D,
  CollisionObb2D,
  CollisionPolygon2D,
} from '@flighthq/types/contract';

import { packContactFeatureId } from './contactFeatureId';
import { clearCollisionContactManifold2D } from './contactManifold2D';
import { writeAabbVertices, writeObbVertices } from './convexVertices2D';

// Capsule contact manifolds. Separate from `shapeContact2D.ts` because the capsule is the one built-in
// whose surface is neither a polygon nor a single disc, so it shares neither the SAT-over-vertices core
// nor the one-point circle writer: it needs a separating-axis search whose candidate set includes its own
// rounded ends, and it is the only kind that can produce a TWO-POINT manifold from a curved surface.
//
// Every function here writes the normal pushing **A out of B** and places contact points on **A's
// surface**, matching `shapeContact2D.ts` exactly. Touching is exclusive: a pair at precisely zero
// separation is reported as not overlapping.

// Capsule vs axis-aligned box.
export function collideCapsuleAabbContactManifold2D(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionAabb2D>,
  out: CollisionContactManifold2D,
): boolean {
  writeAabbVertices(b, capsuleScratch.vertices);
  return capsulePolygonContact(a, capsuleScratch.vertices, 4, out);
}

// Capsule vs capsule.
//
// Two rounded shapes, and yet this is the pair most likely to need TWO points: two capsules lying
// side by side is a resting configuration, and a single contact point would let the pair rock about it
// forever. The parallel case is detected and clipped; everything else is a one-point rounded contact
// between the closest points on the two axes.
export function collideCapsuleCapsuleContactManifold2D(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionCapsule2D>,
  out: CollisionContactManifold2D,
): boolean {
  if (!(a.radius > 0) || !(b.radius > 0)) {
    clearCollisionContactManifold2D(out);
    return false;
  }

  // A separating-axis search, NOT a distance between the two axes. The distance reduction is only valid
  // while the segments are disjoint: two capsules crossing in an X have axes at distance zero and are
  // deeply interpenetrating, and reading that as "the surfaces just barely reach" reports a depth of
  // `rA + rB` along an arbitrary perpendicular — which does not separate them at all, because clearing a
  // crossed pair means moving far enough for the SEGMENTS to clear, a distance set by their lengths and
  // not by their radii.
  //
  // The candidate set is the boundary of the pair's Minkowski difference, which is the sum of segment A,
  // reflected segment B, and a disc of radius `rA + rB`: four flat sides, from the two axes' own
  // perpendiculars, and four circular corners, one per endpoint pair.
  let bestSeparation = Number.NEGATIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;

  writePerpendicular(a.x1 - a.x0, a.y1 - a.y0);
  const perpAX = capsuleScratch.axis[0];
  const perpAY = capsuleScratch.axis[1];
  writePerpendicular(b.x1 - b.x0, b.y1 - b.y0);
  const perpBX = capsuleScratch.axis[0];
  const perpBY = capsuleScratch.axis[1];

  for (const [nx, ny] of [
    [perpAX, perpAY],
    [-perpAX, -perpAY],
    [perpBX, perpBY],
    [-perpBX, -perpBY],
  ]) {
    const separation = capsuleCapsuleSeparation(a, b, nx, ny);
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestNormalX = nx;
      bestNormalY = ny;
    }
  }

  for (const [ax, ay] of [
    [a.x0, a.y0],
    [a.x1, a.y1],
  ]) {
    for (const [bx, by] of [
      [b.x0, b.y0],
      [b.x1, b.y1],
    ]) {
      const dx = ax - bx;
      const dy = ay - by;
      const length = Math.hypot(dx, dy);
      if (length <= EPSILON) continue;
      const separation = capsuleCapsuleSeparation(a, b, dx / length, dy / length);
      if (separation > bestSeparation) {
        bestSeparation = separation;
        bestNormalX = dx / length;
        bestNormalY = dy / length;
      }
    }
  }

  if (bestSeparation >= 0 || bestSeparation === Number.NEGATIVE_INFINITY) {
    clearCollisionContactManifold2D(out);
    return false;
  }
  const depth = -bestSeparation;

  // Parallel and overlapping: the flat sides face each other and the contact is a span, not a point.
  if (writeParallelAxisOverlap(a, b, bestNormalX, bestNormalY) > 0) {
    out.overlapping = true;
    out.normalX = bestNormalX;
    out.normalY = bestNormalY;
    out.depth = depth;
    for (let at = 0; at < 2; at += 1) {
      const point = out.points[at];
      point.x = capsuleScratch.span[at * 2] - bestNormalX * a.radius;
      point.y = capsuleScratch.span[at * 2 + 1] - bestNormalY * a.radius;
      point.depth = depth;
      point.featureId = packContactFeatureId(true, 0, 0, at === 1);
    }
    out.pointCount = 2;
    return true;
  }

  // One point, on A's surface. WHICH axis point to offset from depends on how the normal sits relative
  // to the axis, and getting this wrong puts the contact inside the shape rather than on it.
  //
  // When the normal is perpendicular to the axis the contact is on A's flat side, every axis point is
  // equally valid, and the closest point to B is the best-positioned one. When it is not — a rounded end
  // pressed into something — only the SUPPORT point works: `axisPoint - normal * radius` sits at
  // `radius * |sin(angle)|` from the axis for any other choice, which is inside the capsule. The support
  // point is on the boundary by definition, which is exactly the property needed here.
  const axisLength = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
  const alongAxis = axisLength > EPSILON ? ((a.x1 - a.x0) * bestNormalX + (a.y1 - a.y0) * bestNormalY) / axisLength : 0;
  if (Math.abs(alongAxis) <= PARALLEL_EPSILON) {
    writeClosestPointsBetweenSegments(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1);
  } else if (a.x0 * bestNormalX + a.y0 * bestNormalY <= a.x1 * bestNormalX + a.y1 * bestNormalY) {
    capsuleScratch.closest[0] = a.x0;
    capsuleScratch.closest[1] = a.y0;
  } else {
    capsuleScratch.closest[0] = a.x1;
    capsuleScratch.closest[1] = a.y1;
  }
  return writeSingleCapsulePoint(
    capsuleScratch.closest[0],
    capsuleScratch.closest[1],
    a.radius,
    bestNormalX,
    bestNormalY,
    depth,
    0,
    out,
  );
}

// How far A's surface clears B's along `normal`, which points from B toward A. Negative means
// overlapping. Both extents come from the axes plus a radius, with no surface to sample.
function capsuleCapsuleSeparation(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionCapsule2D>,
  normalX: number,
  normalY: number,
): number {
  const minimumA = Math.min(a.x0 * normalX + a.y0 * normalY, a.x1 * normalX + a.y1 * normalY) - a.radius;
  const maximumB = Math.max(b.x0 * normalX + b.y0 * normalY, b.x1 * normalX + b.y1 * normalY) + b.radius;
  return minimumA - maximumB;
}

// Capsule vs oriented box.
export function collideCapsuleObbContactManifold2D(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionObb2D>,
  out: CollisionContactManifold2D,
): boolean {
  writeObbVertices(b, capsuleScratch.vertices);
  return capsulePolygonContact(a, capsuleScratch.vertices, 4, out);
}

// Capsule vs convex polygon.
export function collideCapsulePolygonContactManifold2D(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionPolygon2D>,
  out: CollisionContactManifold2D,
): boolean {
  return capsulePolygonContact(a, b.points, b.points.length >> 1, out);
}

// Circle vs capsule.
//
// Exactly circle-vs-circle once the capsule is reduced to the disc at its closest axis point, which is
// what a capsule IS at any single point of contact — there is no separate body and cap case to get
// wrong, and no approximation in saying so.
export function collideCircleCapsuleContactManifold2D(
  a: Readonly<CollisionCircle2D>,
  b: Readonly<CollisionCapsule2D>,
  out: CollisionContactManifold2D,
): boolean {
  writeClosestPointOnSegment(b.x0, b.y0, b.x1, b.y1, a.x, a.y);
  const closestX = capsuleScratch.closest[0];
  const closestY = capsuleScratch.closest[1];
  let normalX = a.x - closestX;
  let normalY = a.y - closestY;
  const distance = Math.hypot(normalX, normalY);
  const sum = a.radius + b.radius;
  if (distance >= sum) {
    clearCollisionContactManifold2D(out);
    return false;
  }
  if (distance > EPSILON) {
    normalX /= distance;
    normalY /= distance;
  } else {
    // The circle's centre sits on the capsule's axis. Push it out sideways: the perpendicular is the
    // shortest way out of a capsule from its own axis, and it is defined even here.
    writePerpendicular(b.x1 - b.x0, b.y1 - b.y0);
    normalX = capsuleScratch.axis[0];
    normalY = capsuleScratch.axis[1];
  }
  return writeSingleCapsulePoint(a.x, a.y, a.radius, normalX, normalY, sum - distance, 0, out);
}

// The separating-axis search for a capsule against a convex polygon, and the clipping that follows it.
//
// The candidate set is what makes this exact rather than approximate, and it has three parts because a
// capsule can meet a polygon three ways:
//   - the polygon's face normals, for the capsule resting against a flat side;
//   - the capsule's own two side normals, for a polygon face lying along the capsule's straight body;
//   - the direction from each polygon VERTEX to the nearest point on the capsule's axis, for a rounded
//     end pressed into a corner. Nothing else covers that case: at a corner the deepest direction is
//     radial from the vertex and matches no face normal of either shape, so a search over face normals
//     alone reports a corner contact along whichever face happens to be least wrong.
function capsulePolygonContact(
  a: Readonly<CollisionCapsule2D>,
  vertices: ArrayLike<number>,
  count: number,
  out: CollisionContactManifold2D,
): boolean {
  if (count < 3 || !(a.radius > 0)) {
    clearCollisionContactManifold2D(out);
    return false;
  }

  let bestSeparation = Number.NEGATIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let bestFace = -1;
  let bestSource = SOURCE_VERTEX;
  let bestIndex = 0;

  for (let face = 0; face < count; face += 1) {
    const next = face + 1 === count ? 0 : face + 1;
    const x0 = vertices[face << 1];
    const y0 = vertices[(face << 1) + 1];
    const edgeX = vertices[next << 1] - x0;
    const edgeY = vertices[(next << 1) + 1] - y0;
    const length = Math.hypot(edgeX, edgeY);
    if (length <= EPSILON) continue;
    // Both windings are admitted, as everywhere else in this package, by orienting the face normal
    // away from the polygon's own interior rather than by assuming a winding.
    let normalX = edgeY / length;
    let normalY = -edgeX / length;
    if (!isOutwardFromPolygon(vertices, count, x0, y0, normalX, normalY)) {
      normalX = -normalX;
      normalY = -normalY;
    }
    const separation = capsuleSeparation(a, vertices, count, normalX, normalY);
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestNormalX = normalX;
      bestNormalY = normalY;
      bestFace = face;
      bestSource = SOURCE_POLYGON_FACE;
      bestIndex = face;
    }
  }

  writePerpendicular(a.x1 - a.x0, a.y1 - a.y0);
  for (let side = 0; side < 2; side += 1) {
    const normalX = side === 0 ? capsuleScratch.axis[0] : -capsuleScratch.axis[0];
    const normalY = side === 0 ? capsuleScratch.axis[1] : -capsuleScratch.axis[1];
    const separation = capsuleSeparation(a, vertices, count, normalX, normalY);
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestNormalX = normalX;
      bestNormalY = normalY;
      bestFace = -1;
      bestSource = SOURCE_CAPSULE_SIDE;
      bestIndex = side;
    }
  }

  for (let vertex = 0; vertex < count; vertex += 1) {
    const vx = vertices[vertex << 1];
    const vy = vertices[(vertex << 1) + 1];
    writeClosestPointOnSegment(a.x0, a.y0, a.x1, a.y1, vx, vy);
    const dx = capsuleScratch.closest[0] - vx;
    const dy = capsuleScratch.closest[1] - vy;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) continue;
    const normalX = dx / length;
    const normalY = dy / length;
    const separation = capsuleSeparation(a, vertices, count, normalX, normalY);
    if (separation > bestSeparation) {
      bestSeparation = separation;
      bestNormalX = normalX;
      bestNormalY = normalY;
      bestFace = -1;
      bestSource = SOURCE_VERTEX;
      bestIndex = vertex;
    }
  }

  if (bestSeparation >= 0 || bestSeparation === Number.NEGATIVE_INFINITY) {
    clearCollisionContactManifold2D(out);
    return false;
  }
  const depth = -bestSeparation;

  // A polygon face won, and the capsule's axis lies along it: the contact is a span. Clipping the axis
  // to the face's extent is what produces the second point, and it is the whole reason a capsule can
  // rest flat on a floor instead of rocking on one point forever.
  if (bestSource === SOURCE_POLYGON_FACE && writeFaceSpan(a, vertices, count, bestFace, bestNormalX, bestNormalY)) {
    out.overlapping = true;
    out.normalX = bestNormalX;
    out.normalY = bestNormalY;
    out.depth = depth;
    for (let at = 0; at < 2; at += 1) {
      const point = out.points[at];
      point.x = capsuleScratch.span[at * 2] - bestNormalX * a.radius;
      point.y = capsuleScratch.span[at * 2 + 1] - bestNormalY * a.radius;
      point.depth = capsuleScratch.spanDepth[at];
      point.featureId = packContactFeatureId(false, bestFace, 0, at === 1);
    }
    out.pointCount = 2;
    return true;
  }

  // One point, at whichever place on the capsule's axis is deepest along the winning normal.
  writeDeepestAxisPoint(a, bestNormalX, bestNormalY, vertices, count, bestSource, bestIndex);
  return writeSingleCapsulePoint(
    capsuleScratch.closest[0],
    capsuleScratch.closest[1],
    a.radius,
    bestNormalX,
    bestNormalY,
    depth,
    packContactFeatureId(bestSource === SOURCE_CAPSULE_SIDE, bestIndex, 0, false),
    out,
  );
}

// How far the capsule's surface clears the polygon along `normal`, which points from the polygon toward
// the capsule. Negative means overlapping by that much.
//
// The capsule's extent subtracts its radius rather than scanning a surface: every point of a capsule is
// within `radius` of its axis, so the axis's own minimum along the normal, less the radius, IS the
// surface minimum with no sampling.
function capsuleSeparation(
  a: Readonly<CollisionCapsule2D>,
  vertices: ArrayLike<number>,
  count: number,
  normalX: number,
  normalY: number,
): number {
  const axisMinimum = Math.min(a.x0 * normalX + a.y0 * normalY, a.x1 * normalX + a.y1 * normalY) - a.radius;
  let polygonMaximum = Number.NEGATIVE_INFINITY;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const projection = vertices[vertex << 1] * normalX + vertices[(vertex << 1) + 1] * normalY;
    if (projection > polygonMaximum) polygonMaximum = projection;
  }
  return axisMinimum - polygonMaximum;
}

// Whether `normal` at (`x`,`y`) points out of the polygon rather than into it.
function isOutwardFromPolygon(
  vertices: ArrayLike<number>,
  count: number,
  x: number,
  y: number,
  normalX: number,
  normalY: number,
): boolean {
  for (let vertex = 0; vertex < count; vertex += 1) {
    const projection = (vertices[vertex << 1] - x) * normalX + (vertices[(vertex << 1) + 1] - y) * normalY;
    if (projection > EPSILON) return false;
  }
  return true;
}

// Clips the capsule's axis to the winning face's extent and keeps the result only if BOTH ends survive
// with real depth, which is what distinguishes a capsule lying along a face from one touching it at a
// point. Returns false for the point case, leaving the caller to write a single contact.
function writeFaceSpan(
  a: Readonly<CollisionCapsule2D>,
  vertices: ArrayLike<number>,
  count: number,
  face: number,
  normalX: number,
  normalY: number,
): boolean {
  const axisX = a.x1 - a.x0;
  const axisY = a.y1 - a.y0;
  const axisLength = Math.hypot(axisX, axisY);
  if (axisLength <= EPSILON) return false;
  // The capsule's flat SIDE has to be the thing facing the face, which means its axis lies along the
  // face and not into it. Without this a near-end-on capsule still projects a span onto the face and
  // still clears both depth checks, and the two points it produces are placed by stepping `radius` along
  // a normal that is nearly parallel to the axis — which lands them deep INSIDE the capsule rather than
  // on it. An end-on capsule has one genuine point of contact and must be left to the single-point path.
  if (Math.abs((axisX / axisLength) * normalX + (axisY / axisLength) * normalY) > PARALLEL_EPSILON) return false;

  const next = face + 1 === count ? 0 : face + 1;
  const faceX0 = vertices[face << 1];
  const faceY0 = vertices[(face << 1) + 1];
  const faceX1 = vertices[next << 1];
  const faceY1 = vertices[(next << 1) + 1];
  const tangentX = faceX1 - faceX0;
  const tangentY = faceY1 - faceY0;
  const faceLength = Math.hypot(tangentX, tangentY);
  if (faceLength <= EPSILON) return false;
  const unitX = tangentX / faceLength;
  const unitY = tangentY / faceLength;

  // The capsule's axis projected onto the face's own direction, clipped to the face's span.
  const start = (a.x0 - faceX0) * unitX + (a.y0 - faceY0) * unitY;
  const end = (a.x1 - faceX0) * unitX + (a.y1 - faceY0) * unitY;
  const low = Math.max(Math.min(start, end), 0);
  const high = Math.min(Math.max(start, end), faceLength);
  if (high - low <= CONTACT_SPAN_EPSILON) return false;

  for (let at = 0; at < 2; at += 1) {
    const along = at === 0 ? low : high;
    // Back from the face's parameter to the point on the capsule's axis with that projection.
    const fraction = (along - start) / (end - start);
    const x = a.x0 + (a.x1 - a.x0) * fraction;
    const y = a.y0 + (a.y1 - a.y0) * fraction;
    capsuleScratch.span[at * 2] = x;
    capsuleScratch.span[at * 2 + 1] = y;
    capsuleScratch.spanDepth[at] = a.radius - ((x - faceX0) * normalX + (y - faceY0) * normalY);
  }
  // A span whose ends do not both touch is a point contact wearing a span's clothing: keeping it would
  // hand the solver a contact at a place the shapes are not in contact.
  return capsuleScratch.spanDepth[0] > 0 && capsuleScratch.spanDepth[1] > 0;
}

// The point on the capsule's AXIS that is deepest along the contact normal, written into `closest`.
function writeDeepestAxisPoint(
  a: Readonly<CollisionCapsule2D>,
  normalX: number,
  normalY: number,
  vertices: ArrayLike<number>,
  count: number,
  source: number,
  index: number,
): void {
  if (source === SOURCE_VERTEX) {
    // The winning axis came from this vertex, so the contact is where the axis is nearest to it.
    writeClosestPointOnSegment(a.x0, a.y0, a.x1, a.y1, vertices[index << 1], vertices[(index << 1) + 1]);
    return;
  }
  const projection0 = a.x0 * normalX + a.y0 * normalY;
  const projection1 = a.x1 * normalX + a.y1 * normalY;
  if (source === SOURCE_CAPSULE_SIDE) {
    // A capsule side won, so both endpoints project equally along the normal and the axial position is
    // undetermined by it. The polygon's own deepest vertex decides where along the capsule to sit.
    let deepest = 0;
    let deepestProjection = Number.NEGATIVE_INFINITY;
    for (let vertex = 0; vertex < count; vertex += 1) {
      const value = vertices[vertex << 1] * normalX + vertices[(vertex << 1) + 1] * normalY;
      if (value > deepestProjection) {
        deepestProjection = value;
        deepest = vertex;
      }
    }
    writeClosestPointOnSegment(a.x0, a.y0, a.x1, a.y1, vertices[deepest << 1], vertices[(deepest << 1) + 1]);
    return;
  }
  if (projection0 <= projection1) {
    capsuleScratch.closest[0] = a.x0;
    capsuleScratch.closest[1] = a.y0;
  } else {
    capsuleScratch.closest[0] = a.x1;
    capsuleScratch.closest[1] = a.y1;
  }
}

// The overlap of two parallel capsule axes along their shared direction, written into `span` as points
// on A's axis. Returns the overlap length, or 0 when the pair is not parallel enough to have one.
function writeParallelAxisOverlap(
  a: Readonly<CollisionCapsule2D>,
  b: Readonly<CollisionCapsule2D>,
  normalX: number,
  normalY: number,
): number {
  const axisAX = a.x1 - a.x0;
  const axisAY = a.y1 - a.y0;
  const lengthA = Math.hypot(axisAX, axisAY);
  const lengthB = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
  if (lengthA <= EPSILON || lengthB <= EPSILON) return 0;
  const unitX = axisAX / lengthA;
  const unitY = axisAY / lengthA;
  // Both axes must be perpendicular to the contact normal, which is what "lying side by side" means.
  // A pair meeting end-to-end or at an angle has a genuine single point of contact and must not be
  // handed a fabricated second one.
  if (Math.abs(unitX * normalX + unitY * normalY) > PARALLEL_EPSILON) return 0;
  const unitBX = (b.x1 - b.x0) / lengthB;
  const unitBY = (b.y1 - b.y0) / lengthB;
  if (Math.abs(unitBX * normalX + unitBY * normalY) > PARALLEL_EPSILON) return 0;

  const startB = (b.x0 - a.x0) * unitX + (b.y0 - a.y0) * unitY;
  const endB = (b.x1 - a.x0) * unitX + (b.y1 - a.y0) * unitY;
  const low = Math.max(Math.min(startB, endB), 0);
  const high = Math.min(Math.max(startB, endB), lengthA);
  const overlap = high - low;
  if (overlap <= CONTACT_SPAN_EPSILON) return 0;
  capsuleScratch.span[0] = a.x0 + unitX * low;
  capsuleScratch.span[1] = a.y0 + unitY * low;
  capsuleScratch.span[2] = a.x0 + unitX * high;
  capsuleScratch.span[3] = a.y0 + unitY * high;
  return overlap;
}

// The closest point on a segment to a point, written into `closest[0..1]`.
function writeClosestPointOnSegment(x0: number, y0: number, x1: number, y1: number, px: number, py: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;
  let t = 0;
  if (lengthSquared > 0) {
    t = ((px - x0) * dx + (py - y0) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  capsuleScratch.closest[0] = x0 + t * dx;
  capsuleScratch.closest[1] = y0 + t * dy;
}

// The closest pair of points between two segments, written into `closest[0..3]` as A's then B's.
//
// The clamped analytic solution, with the parallel case falling back to the four endpoint-to-segment
// distances. Parallel segments have a whole interval of equally-close pairs, so any single answer is as
// correct as another and the caller decides whether the pair earns two contact points.
function writeClosestPointsBetweenSegments(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
): void {
  const dax = ax1 - ax0;
  const day = ay1 - ay0;
  const dbx = bx1 - bx0;
  const dby = by1 - by0;
  const rx = ax0 - bx0;
  const ry = ay0 - by0;
  const aa = dax * dax + day * day;
  const bb = dbx * dbx + dby * dby;
  const f = dbx * rx + dby * ry;

  let s = 0;
  let t = 0;
  if (aa <= EPSILON && bb <= EPSILON) {
    s = 0;
    t = 0;
  } else if (aa <= EPSILON) {
    t = clamp01(f / bb);
  } else {
    const c = dax * rx + day * ry;
    if (bb <= EPSILON) {
      s = clamp01(-c / aa);
    } else {
      const b = dax * dbx + day * dby;
      const denominator = aa * bb - b * b;
      s = denominator > EPSILON ? clamp01((b * f - c * bb) / denominator) : 0;
      t = (b * s + f) / bb;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / aa);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / aa);
      }
    }
  }
  capsuleScratch.closest[0] = ax0 + dax * s;
  capsuleScratch.closest[1] = ay0 + day * s;
  capsuleScratch.closest[2] = bx0 + dbx * t;
  capsuleScratch.closest[3] = by0 + dby * t;
}

// The unit perpendicular of a direction, written into `axis`. Falls back to +x for a zero-length input,
// which is the degenerate capsule that is really a circle and has no axis to be perpendicular to.
function writePerpendicular(dx: number, dy: number): void {
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) {
    capsuleScratch.axis[0] = 1;
    capsuleScratch.axis[1] = 0;
    return;
  }
  capsuleScratch.axis[0] = -dy / length;
  capsuleScratch.axis[1] = dx / length;
}

// The one-point manifold shared by every capsule pair that does not resolve to a span. `surfaceX`/
// `surfaceY` is the point on A's AXIS (or A's centre, for a circle) that the normal is measured from.
function writeSingleCapsulePoint(
  axisX: number,
  axisY: number,
  radius: number,
  normalX: number,
  normalY: number,
  depth: number,
  featureId: number,
  out: CollisionContactManifold2D,
): boolean {
  out.overlapping = true;
  out.normalX = normalX;
  out.normalY = normalY;
  out.depth = depth;
  const point = out.points[0];
  point.x = axisX - normalX * radius;
  point.y = axisY - normalY * radius;
  point.depth = depth;
  point.featureId = featureId;
  out.pointCount = 1;
  return true;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const EPSILON = 1e-9;
// A span shorter than this is a point contact, and fabricating a second point on it would hand the
// solver two contacts where the shapes touch once.
const CONTACT_SPAN_EPSILON = 1e-6;
// How close to perpendicular the two axes must be to the contact normal before the pair counts as lying
// side by side. Generous on purpose: a nearly-parallel resting pair wants two points, and one point
// short of the threshold rocks.
const PARALLEL_EPSILON = 1e-3;

const SOURCE_POLYGON_FACE = 0;
const SOURCE_CAPSULE_SIDE = 1;
const SOURCE_VERTEX = 2;

// Reused across every capsule contact: these run per collider pair per step in a physics world.
const capsuleScratch = {
  axis: [0, 0],
  closest: [0, 0, 0, 0],
  span: [0, 0, 0, 0],
  spanDepth: [0, 0],
  // A Float64Array because that is what `writeAabbVertices`/`writeObbVertices` write into, and eight
  // slots because both produce exactly four corners.
  vertices: new Float64Array(8),
};
