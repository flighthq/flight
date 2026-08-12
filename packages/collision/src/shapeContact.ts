import type {
  CollisionAabb,
  CollisionCircle,
  CollisionContactManifold,
  CollisionManifold,
  CollisionObb,
  CollisionPolygon,
} from '@flighthq/types/contract';

import { FEATURE_INDEX_LIMIT, packContactFeatureId } from './contactFeatureId';
import { clearCollisionContactManifold } from './contactManifold';
import { writeAabbVertices, writeObbVertices } from './convexVertices';
import { createCollisionManifold } from './manifold';
import {
  testCircleAabbCollision,
  testCircleCircleCollision,
  testCircleObbCollision,
  testCirclePolygonCollision,
} from './shapeCollision';

// The 2D narrow-phase contact tests — the same ten manifold-bearing pairs as the `test*Collision`
// family, but resolving the full contact set instead of only the minimum-translation vector. Each
// writes an `out` CollisionContactManifold and returns whether the pair overlaps; the normal, depth,
// and touching-is-not-overlapping convention match `test*Collision` exactly.
//
// These are a strict superset of the lean tests and cost more: convex pairs run reference/incident
// face selection and segment clipping on top of the separating-axis search. They live in their own
// module, and take their own entry points, so a bundle that only asks "do these overlap?" links the
// lean path alone and never pays for the clipping machinery. Reach for these when simulating the
// pair (a rigid-body solver needs a point to apply an impulse at); reach for `test*Collision` when
// merely detecting it.
//
// Convex pairs resolve up to two points by clipping the incident face against the reference face's
// side planes. Circle pairs are single-point by construction: a circle touches a convex shape along
// one surface point.

// Axis-aligned box vs axis-aligned box.
export function collideAabbAabbContactManifold(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionAabb>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    writeAabbVertices(a, scratch.verticesA);
    writeAabbVertices(b, scratch.verticesB);
    return convexContact(scratch.verticesA, 4, scratch.verticesB, 4, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Axis-aligned box vs oriented box.
export function collideAabbObbContactManifold(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionObb>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    writeAabbVertices(a, scratch.verticesA);
    writeObbVertices(b, scratch.verticesB);
    return convexContact(scratch.verticesA, 4, scratch.verticesB, 4, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Axis-aligned box vs convex polygon.
export function collideAabbPolygonContactManifold(
  a: Readonly<CollisionAabb>,
  b: Readonly<CollisionPolygon>,
  out: CollisionContactManifold,
): boolean {
  const bPoints = b.points;
  const scratch = acquireShapeContactScratch();
  try {
    writeAabbVertices(a, scratch.verticesA);
    return convexContact(scratch.verticesA, 4, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Circle vs axis-aligned box. One contact point, on the circle's surface.
export function collideCircleAabbContactManifold(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionAabb>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    if (!testCircleAabbCollision(a, b, scratch.leanManifold)) {
      clearCollisionContactManifold(out);
      return false;
    }
    return writeCircleContact(a.x, a.y, a.radius, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Circle vs circle. One contact point, on A's surface.
export function collideCircleCircleContactManifold(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionCircle>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    if (!testCircleCircleCollision(a, b, scratch.leanManifold)) {
      clearCollisionContactManifold(out);
      return false;
    }
    return writeCircleContact(a.x, a.y, a.radius, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Circle vs oriented box. One contact point, on the circle's surface.
export function collideCircleObbContactManifold(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionObb>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    if (!testCircleObbCollision(a, b, scratch.leanManifold)) {
      clearCollisionContactManifold(out);
      return false;
    }
    return writeCircleContact(a.x, a.y, a.radius, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Circle vs convex polygon. One contact point, on the circle's surface.
export function collideCirclePolygonContactManifold(
  a: Readonly<CollisionCircle>,
  b: Readonly<CollisionPolygon>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    if (!testCirclePolygonCollision(a, b, scratch.leanManifold)) {
      clearCollisionContactManifold(out);
      return false;
    }
    return writeCircleContact(a.x, a.y, a.radius, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Oriented box vs oriented box.
export function collideObbObbContactManifold(
  a: Readonly<CollisionObb>,
  b: Readonly<CollisionObb>,
  out: CollisionContactManifold,
): boolean {
  const scratch = acquireShapeContactScratch();
  try {
    writeObbVertices(a, scratch.verticesA);
    writeObbVertices(b, scratch.verticesB);
    return convexContact(scratch.verticesA, 4, scratch.verticesB, 4, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Oriented box vs convex polygon.
export function collideObbPolygonContactManifold(
  a: Readonly<CollisionObb>,
  b: Readonly<CollisionPolygon>,
  out: CollisionContactManifold,
): boolean {
  const bPoints = b.points;
  const scratch = acquireShapeContactScratch();
  try {
    writeObbVertices(a, scratch.verticesA);
    return convexContact(scratch.verticesA, 4, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Convex polygon vs convex polygon — the general convex contact core.
export function collidePolygonPolygonContactManifold(
  a: Readonly<CollisionPolygon>,
  b: Readonly<CollisionPolygon>,
  out: CollisionContactManifold,
): boolean {
  const aPoints = a.points;
  const bPoints = b.points;
  const scratch = acquireShapeContactScratch();
  try {
    return convexContact(aPoints, aPoints.length >> 1, bPoints, bPoints.length >> 1, out, scratch);
  } finally {
    releaseShapeContactScratch(scratch);
  }
}

// Convex-vs-convex contact resolution over two flat `[x0,y0,...]` vertex lists, writing the
// manifold pushing **A out of B**.
//
// The separating-axis search runs per shape and reports the *least negative* separation — the
// shallowest face, which is the axis a solver must push along. The shape owning that face is the
// **reference**; the other is the **incident**, and its most anti-parallel face is the one actually
// in contact. Clipping that incident face against the reference face's two side planes leaves the
// overlapping span, whose endpoints (those still behind the reference face) are the contact points.
// This is the standard 2D face-clipping construction; the one-point cases fall out of it naturally
// when the clip collapses to a corner.
function convexContact(
  ax: ArrayLike<number>,
  an: number,
  bx: ArrayLike<number>,
  bn: number,
  out: CollisionContactManifold,
  scratch: ShapeContactScratch,
): boolean {
  // Fewer than three vertices has no interior and no face to clip against. Degenerate input would
  // otherwise leave the separation search with no candidate axis and poison the manifold with NaN,
  // which in a physics step is unrecoverable — report a clean miss instead. Past FEATURE_INDEX_LIMIT
  // the face indices no longer pack into distinct feature ids, and a silently aliased id is worse than
  // a reported miss: the solver would warm-start a contact from an unrelated contact's impulse.
  if (an < 3 || bn < 3 || an > FEATURE_INDEX_LIMIT || bn > FEATURE_INDEX_LIMIT) {
    clearCollisionContactManifold(out);
    return false;
  }

  const separationA = maxFaceSeparation(ax, an, bx, bn, scratch);
  if (separationA >= 0 || scratch.separationEdge < 0) {
    clearCollisionContactManifold(out);
    return false;
  }
  const edgeA = scratch.separationEdge;
  const normalAX = scratch.separationNormalX;
  const normalAY = scratch.separationNormalY;

  const separationB = maxFaceSeparation(bx, bn, ax, an, scratch);
  if (separationB >= 0 || scratch.separationEdge < 0) {
    clearCollisionContactManifold(out);
    return false;
  }
  const edgeB = scratch.separationEdge;

  // Near-ties get a magnitude-relative nudge toward A so the reference shape does not flip between
  // frames on floating-point noise. A flip renumbers every feature id, which would silently discard
  // the solver's warm-start impulses and make a resting stack jitter.
  const magnitude = Math.abs(separationA) > Math.abs(separationB) ? Math.abs(separationA) : Math.abs(separationB);
  const referenceIsA = separationB <= separationA + REFERENCE_BIAS * magnitude;

  const referenceX = referenceIsA ? ax : bx;
  const referenceCount = referenceIsA ? an : bn;
  const incidentX = referenceIsA ? bx : ax;
  const incidentCount = referenceIsA ? bn : an;
  const referenceEdge = referenceIsA ? edgeA : edgeB;
  const normalX = referenceIsA ? normalAX : scratch.separationNormalX;
  const normalY = referenceIsA ? normalAY : scratch.separationNormalY;

  const referenceNext = referenceEdge + 1 === referenceCount ? 0 : referenceEdge + 1;
  const v1X = referenceX[referenceEdge << 1];
  const v1Y = referenceX[(referenceEdge << 1) + 1];
  const v2X = referenceX[referenceNext << 1];
  const v2Y = referenceX[(referenceNext << 1) + 1];

  const incidentEdge = mostAntiParallelEdge(incidentX, incidentCount, normalX, normalY);
  const incidentNext = incidentEdge + 1 === incidentCount ? 0 : incidentEdge + 1;
  const p0X = incidentX[incidentEdge << 1];
  const p0Y = incidentX[(incidentEdge << 1) + 1];
  const p1X = incidentX[incidentNext << 1];
  const p1Y = incidentX[(incidentNext << 1) + 1];

  // The reference face's own extent along its tangent bounds the contact span; the incident segment
  // is clipped to it in parameter space, which keeps both endpoints on the incident surface.
  let tangentX = v2X - v1X;
  let tangentY = v2Y - v1Y;
  const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  if (tangentLength <= EPS) {
    clearCollisionContactManifold(out);
    return false;
  }
  tangentX /= tangentLength;
  tangentY /= tangentLength;

  const low = tangentX * v1X + tangentY * v1Y;
  const high = tangentX * v2X + tangentY * v2Y;
  const t0 = tangentX * p0X + tangentY * p0Y;
  const t1 = tangentX * p1X + tangentY * p1Y;

  let clipStart = 0;
  let clipEnd = 1;
  const tangentSpan = t1 - t0;
  if (Math.abs(tangentSpan) > EPS) {
    const sLow = (low - t0) / tangentSpan;
    const sHigh = (high - t0) / tangentSpan;
    const sMin = sLow < sHigh ? sLow : sHigh;
    const sMax = sLow < sHigh ? sHigh : sLow;
    if (sMin > clipStart) clipStart = sMin;
    if (sMax < clipEnd) clipEnd = sMax;
  } else if (t0 < low - EPS || t0 > high + EPS) {
    clipStart = 1;
    clipEnd = 0;
  }

  // The MTV normal is the reference face's outward normal, which points from the reference shape
  // toward the incident one. Pushing A out of B therefore means negating it exactly when A is the
  // reference shape.
  const referenceSeparation = referenceIsA ? separationA : separationB;
  out.normalX = referenceIsA ? -normalX : normalX;
  out.normalY = referenceIsA ? -normalY : normalY;
  out.depth = -referenceSeparation;
  out.overlapping = true;
  out.pointCount = 0;

  if (clipStart <= clipEnd) {
    const first = packContactFeatureId(referenceIsA, referenceEdge, incidentEdge, false);
    appendClippedContact(p0X, p0Y, p1X, p1Y, clipStart, v1X, v1Y, normalX, normalY, first, out);
    if (clipEnd > clipStart) {
      const second = packContactFeatureId(referenceIsA, referenceEdge, incidentEdge, true);
      appendClippedContact(p0X, p0Y, p1X, p1Y, clipEnd, v1X, v1Y, normalX, normalY, second, out);
    }
  }
  return true;
}

// Evaluates the clipped incident point at parameter `s` and appends it when it lies behind the
// reference face (that is, actually penetrating). Points that clip into the face's span but sit in
// front of it are separated at that end of the contact and carry no impulse.
function appendClippedContact(
  p0X: number,
  p0Y: number,
  p1X: number,
  p1Y: number,
  s: number,
  faceX: number,
  faceY: number,
  normalX: number,
  normalY: number,
  featureId: number,
  out: CollisionContactManifold,
): void {
  const x = p0X + (p1X - p0X) * s;
  const y = p0Y + (p1Y - p0Y) * s;
  const separation = normalX * (x - faceX) + normalY * (y - faceY);
  if (separation > 0) return;

  const point = out.points[out.pointCount];
  point.x = x;
  point.y = y;
  point.depth = -separation;
  point.featureId = featureId;
  out.pointCount++;
}

// Returns the greatest separation of shape O from any face of shape S, writing the winning face's
// index and unit outward normal into the call's leased scratch. A positive result means a separating axis
// exists and the pair is disjoint; the least-negative result is the minimum-translation face.
// Outward orientation is derived from S's centroid, so winding does not matter — matching the
// winding-agnostic contract the lean tests already document.
function maxFaceSeparation(
  sx: ArrayLike<number>,
  sn: number,
  ox: ArrayLike<number>,
  on: number,
  scratch: ShapeContactScratch,
): number {
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < sn; i++) {
    centroidX += sx[i << 1];
    centroidY += sx[(i << 1) + 1];
  }
  centroidX /= sn;
  centroidY /= sn;

  let best = -Infinity;
  let bestEdge = -1;
  let bestNormalX = 0;
  let bestNormalY = 0;
  for (let i = 0; i < sn; i++) {
    const j = i + 1 === sn ? 0 : i + 1;
    const x0 = sx[i << 1];
    const y0 = sx[(i << 1) + 1];
    let normalX = sx[(j << 1) + 1] - y0;
    let normalY = x0 - sx[j << 1];
    const length = Math.sqrt(normalX * normalX + normalY * normalY);
    if (length <= EPS) continue;
    normalX /= length;
    normalY /= length;
    if (normalX * (x0 - centroidX) + normalY * (y0 - centroidY) < 0) {
      normalX = -normalX;
      normalY = -normalY;
    }

    let separation = Infinity;
    for (let k = 0; k < on; k++) {
      const projected = normalX * (ox[k << 1] - x0) + normalY * (ox[(k << 1) + 1] - y0);
      if (projected < separation) separation = projected;
    }
    if (separation > best) {
      best = separation;
      bestEdge = i;
      bestNormalX = normalX;
      bestNormalY = normalY;
    }
  }

  scratch.separationEdge = bestEdge;
  scratch.separationNormalX = bestNormalX;
  scratch.separationNormalY = bestNormalY;
  return best;
}

// Returns the index of the shape's face whose outward normal opposes (`normalX`,`normalY`) most
// directly — the face lying against the reference face, and so the one to clip.
function mostAntiParallelEdge(px: ArrayLike<number>, pn: number, normalX: number, normalY: number): number {
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < pn; i++) {
    centroidX += px[i << 1];
    centroidY += px[(i << 1) + 1];
  }
  centroidX /= pn;
  centroidY /= pn;

  let best = Infinity;
  let bestEdge = 0;
  for (let i = 0; i < pn; i++) {
    const j = i + 1 === pn ? 0 : i + 1;
    const x0 = px[i << 1];
    const y0 = px[(i << 1) + 1];
    let edgeNormalX = px[(j << 1) + 1] - y0;
    let edgeNormalY = x0 - px[j << 1];
    const length = Math.sqrt(edgeNormalX * edgeNormalX + edgeNormalY * edgeNormalY);
    if (length <= EPS) continue;
    edgeNormalX /= length;
    edgeNormalY /= length;
    if (edgeNormalX * (x0 - centroidX) + edgeNormalY * (y0 - centroidY) < 0) {
      edgeNormalX = -edgeNormalX;
      edgeNormalY = -edgeNormalY;
    }

    const alignment = edgeNormalX * normalX + edgeNormalY * normalY;
    if (alignment < best) {
      best = alignment;
      bestEdge = i;
    }
  }
  return bestEdge;
}

// Promotes the lean manifold left in the call's leased scratch by a circle test into a single-point contact.
// The circle's deepest point lies one radius along the inward normal from its center; a circle has
// no face, so there is one feature pair and one constant id.
function writeCircleContact(
  cx: number,
  cy: number,
  radius: number,
  out: CollisionContactManifold,
  scratch: ShapeContactScratch,
): boolean {
  const normalX = scratch.leanManifold.normalX;
  const normalY = scratch.leanManifold.normalY;
  const depth = scratch.leanManifold.depth;
  out.normalX = normalX;
  out.normalY = normalY;
  out.depth = depth;
  out.overlapping = true;

  const point = out.points[0];
  point.x = cx - normalX * radius;
  point.y = cy - normalY * radius;
  point.depth = depth;
  point.featureId = 0;
  out.pointCount = 1;
  return true;
}

const EPS = 1e-9;
// Fraction of the deeper separation by which the reference face must be beaten before the incident
// shape takes over as reference. Relative rather than absolute so it holds at any world scale.
const REFERENCE_BIAS = 1e-6;
// Feature ids pack (reference shape, reference edge, incident edge, clip slot) into one integer.
// Ten bits per edge index covers any polygon the SAT core can handle in useful time.
interface ShapeContactScratch {
  verticesA: Float64Array;
  verticesB: Float64Array;
  leanManifold: CollisionManifold;
  separationEdge: number;
  separationNormalX: number;
  separationNormalY: number;
}

function acquireShapeContactScratch(): ShapeContactScratch {
  return shapeContactScratchPool.pop() ?? createShapeContactScratch();
}

function createShapeContactScratch(): ShapeContactScratch {
  return {
    verticesA: new Float64Array(8),
    verticesB: new Float64Array(8),
    leanManifold: createCollisionManifold(),
    separationEdge: -1,
    separationNormalX: 0,
    separationNormalY: 0,
  };
}

function releaseShapeContactScratch(scratch: ShapeContactScratch): void {
  shapeContactScratchPool.push(scratch);
}

const shapeContactScratchPool: ShapeContactScratch[] = [createShapeContactScratch()];
