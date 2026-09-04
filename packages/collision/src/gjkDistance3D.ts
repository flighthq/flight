import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { CollisionDistance3D, CollisionShape3D, EntityConstruction } from '@flighthq/types/contract';

import { getCollisionSupport3D } from './collisionSupport3D';

// The DISTANCE between two convex shapes, the direction along which they are closest, and the pair of
// surface points realizing it.
//
// A separate routine from the overlap test in `gjk3D.ts`, deliberately. Both walk a simplex over the
// Minkowski difference, but they answer different questions and reduce the simplex differently: the
// overlap test asks which Voronoi region holds the origin and produces a search DIRECTION, while this
// asks for the closest POINT on the simplex and needs barycentric weights to get it. Retrofitting one
// into the other would put a second set of numeric edge cases through the path that already resolves
// contacts, for no sharing beyond one support call.
//
// This is what continuous collision needs. Conservative advancement steps a pair forward by the time it
// would take to close the current gap at the current approach speed, so it needs the gap and the
// direction — an overlap boolean carries neither, and sampling for one is exactly how a swept test
// misses the thin wall it exists to catch.
//
// The WITNESS POINTS fall out of the same weights and are why the reduction reports them rather than
// compacting the simplex itself. Each difference vertex is a DIFFERENCE of two support points, one per
// shape; applying the barycentric weights of the closest point to the stored halves separately gives the
// closest point on each shape.
//
// What that buys is an INTERIOR closest point. A support function returns extreme points, so asking one
// for the closest feature along the final direction can only ever name a vertex — and two capsules
// crossing at right angles are closest at the middle of each segment, which is measurably two units from
// either end of a four-unit capsule. It buys nothing when the closest features are parallel: every point
// of the shared region ties, the search stops at the first vertex it finds, and the answer is a corner
// either way. That case wants a manifold, and this query does not pretend to be one.

export function createCollisionDistance3D(): CollisionDistance3D {
  const out = allocateEntity<CollisionDistance3D>();
  initializeCollisionDistance3D(out);
  return finishEntity(out);
}

export function initializeCollisionDistance3D(out: EntityConstruction<CollisionDistance3D>): void {
  out.distance = 0;
  out.directionX = 0;
  out.directionY = 0;
  out.directionZ = 0;
  out.pointAX = 0;
  out.pointAY = 0;
  out.pointAZ = 0;
  out.pointBX = 0;
  out.pointBY = 0;
  out.pointBZ = 0;
  out.overlapping = false;
}

// Writes the distance between `a` and `b`, the unit direction of closest approach pointing from B toward
// A — the axis along which separating them is cheapest, and the same orientation a contact normal uses —
// and the closest point on each shape. Returns false when the shapes OVERLAP or when either kind has no
// registered support, in which case everything is left zeroed: there is no gap, no unique axis, and no
// pair of surface points to name.
//
// The optional offset translates `a` before measuring, which is what a swept query needs: only the
// RELATIVE placement of the pair affects the answer, so one offset expresses both shapes moving. Passing
// it costs nothing over building a translated copy of the shape, and a shape has no translate operation
// that would not have to know every kind. The witness on A is reported in that same offset frame.
export function writeCollisionDistance3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionDistance3D,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): boolean {
  clearCollisionDistance3D(out);

  const supportA = getCollisionSupport3D(a.kind);
  const supportB = getCollisionSupport3D(b.kind);
  if (supportA === null || supportB === null) return false;

  // Seed with any support point; the first iteration replaces the direction with a real one.
  supportA(a, 1, 0, 0, scratchSupportA);
  supportB(b, -1, 0, 0, scratchSupportB);
  writeSimplexVertex(0, offsetX, offsetY, offsetZ);
  let count = 1;
  // The reduction that produced the current closest point. A convergence break leaves the simplex as the
  // previous iteration reduced it, so these stay aligned with it and are what the witnesses read.
  reducedCount = 1;
  reducedIndices[0] = 0;
  reducedWeights[0] = 1;

  let closestX = simplex[0];
  let closestY = simplex[1];
  let closestZ = simplex[2];

  for (let iteration = 0; iteration < MAX_DISTANCE_ITERATIONS; iteration += 1) {
    const closestLengthSquared = closestX * closestX + closestY * closestY + closestZ * closestZ;
    if (closestLengthSquared <= DISTANCE_EPSILON * DISTANCE_EPSILON) {
      // The origin is inside the Minkowski difference: the shapes overlap, and there is no gap to
      // measure. The overlap test and `writeEpa3DPenetration` are what answer that case.
      out.overlapping = true;
      return false;
    }

    // Search TOWARD the origin from the current closest point, which is the direction any nearer point
    // of the difference must lie in.
    supportA(a, -closestX, -closestY, -closestZ, scratchSupportA);
    supportB(b, closestX, closestY, closestZ, scratchSupportB);
    const nextX = scratchSupportA[0] + offsetX - scratchSupportB[0];
    const nextY = scratchSupportA[1] + offsetY - scratchSupportB[1];
    const nextZ = scratchSupportA[2] + offsetZ - scratchSupportB[2];

    // Convergence: the furthest the difference reaches toward the origin is no nearer than the point we
    // already have. `next` minimises `closest . x` over the difference by construction, so this quantity
    // is never negative for a separated pair, and it is how much closer the search could still get.
    //
    // The MINUS is the whole test. Adding instead measures `v.v + v.w`, which for a penetrating pair —
    // where `v.w` is large and negative — goes small immediately and breaks out with a non-zero closest
    // point, reporting a gap between shapes that intersect. It also never fires for a separated pair,
    // where the quantity is about `2 * v.v`. One sign, and the query is wrong in both directions at once.
    const progress = closestLengthSquared - (nextX * closestX + nextY * closestY + nextZ * closestZ);
    if (progress <= DISTANCE_TOLERANCE * closestLengthSquared) break;

    // A support point already in the simplex means the search has stalled; continuing would loop.
    if (containsSimplexPoint(count, nextX, nextY, nextZ)) break;

    writeSimplexVertex(count, offsetX, offsetY, offsetZ);
    count += 1;

    if (reduceSimplex(count, scratchClosest) === 4) {
      // A tetrahedron that did not reduce encloses the origin.
      out.overlapping = true;
      return false;
    }
    compactSimplex();
    count = reducedCount;
    closestX = scratchClosest[0];
    closestY = scratchClosest[1];
    closestZ = scratchClosest[2];
  }

  const distance = Math.sqrt(closestX * closestX + closestY * closestY + closestZ * closestZ);
  if (!(distance > 0)) {
    out.overlapping = true;
    return false;
  }
  out.distance = distance;
  out.directionX = closestX / distance;
  out.directionY = closestY / distance;
  out.directionZ = closestZ / distance;
  writeWitnessPoints(out);
  return true;
}

function clearCollisionDistance3D(out: CollisionDistance3D): void {
  out.distance = 0;
  out.directionX = 0;
  out.directionY = 0;
  out.directionZ = 0;
  out.pointAX = 0;
  out.pointAY = 0;
  out.pointAZ = 0;
  out.pointBX = 0;
  out.pointBY = 0;
  out.pointBZ = 0;
  out.overlapping = false;
}

// Moves the surviving vertices to the front of all three parallel arrays, so the reduced simplex occupies
// slots `0 .. reducedCount - 1` and `reducedWeights` indexes it directly.
//
// All three move TOGETHER or the witnesses silently decouple from the geometry: slot `i` of `simplexA`
// has to stay the half of `simplex[i]` that came from A, and a compaction that reordered only the
// difference would keep producing a correct distance while attributing it to the wrong surface points.
function compactSimplex(): void {
  for (let slot = 0; slot < reducedCount; slot += 1) {
    const source = reducedIndices[slot];
    for (let axis = 0; axis < 3; axis += 1) {
      scratchCompact[slot * 3 + axis] = simplex[source * 3 + axis];
      scratchCompactA[slot * 3 + axis] = simplexA[source * 3 + axis];
      scratchCompactB[slot * 3 + axis] = simplexB[source * 3 + axis];
    }
  }
  for (let i = 0; i < reducedCount * 3; i += 1) {
    simplex[i] = scratchCompact[i];
    simplexA[i] = scratchCompactA[i];
    simplexB[i] = scratchCompactB[i];
  }
  for (let slot = 0; slot < reducedCount; slot += 1) reducedIndices[slot] = slot;
}

function containsSimplexPoint(count: number, x: number, y: number, z: number): boolean {
  for (let i = 0; i < count; i += 1) {
    if (simplex[i * 3] === x && simplex[i * 3 + 1] === y && simplex[i * 3 + 2] === z) return true;
  }
  return false;
}

function isOriginOutsideFace(i0: number, i1: number, i2: number, opposite: number): boolean {
  const aX = simplex[i0 * 3];
  const aY = simplex[i0 * 3 + 1];
  const aZ = simplex[i0 * 3 + 2];
  const e1X = simplex[i1 * 3] - aX;
  const e1Y = simplex[i1 * 3 + 1] - aY;
  const e1Z = simplex[i1 * 3 + 2] - aZ;
  const e2X = simplex[i2 * 3] - aX;
  const e2Y = simplex[i2 * 3 + 1] - aY;
  const e2Z = simplex[i2 * 3 + 2] - aZ;
  const normalX = e1Y * e2Z - e1Z * e2Y;
  const normalY = e1Z * e2X - e1X * e2Z;
  const normalZ = e1X * e2Y - e1Y * e2X;

  const towardOrigin = -(normalX * aX + normalY * aY + normalZ * aZ);
  const towardOpposite =
    normalX * (simplex[opposite * 3] - aX) +
    normalY * (simplex[opposite * 3 + 1] - aY) +
    normalZ * (simplex[opposite * 3 + 2] - aZ);
  // Strictly opposite sides: the origin is outside this face.
  return towardOrigin * towardOpposite < 0;
}

// Finds the point of the current simplex closest to the ORIGIN, writes it into `out`, and records which
// vertices own it and with what barycentric weights. Returns the surviving count, or 4 when a tetrahedron
// encloses the origin — which the caller reads as overlap.
//
// The simplex arrays are left UNTOUCHED. Reduction and compaction are split because the tetrahedron case
// weighs several faces before choosing one, and rewriting the simplex mid-search would destroy points a
// later face still has to read.
//
// Each case is a Voronoi-region decomposition solved in barycentric coordinates rather than by projecting
// and testing: the weights say which feature owns the closest point AND where on it, so one set of
// arithmetic answers both — and the same weights are what the witness points need.
function reduceSimplex(count: number, out: number[]): number {
  if (count === 1) {
    out[0] = simplex[0];
    out[1] = simplex[1];
    out[2] = simplex[2];
    return writeReduction(1, 0, 0, 0, 1, 0, 0);
  }
  if (count === 2) return reduceSegment(out);
  if (count === 3) return reduceTriangle(0, 1, 2, out);
  return reduceTetrahedron(out);
}

function reduceSegment(out: number[]): number {
  const aX = simplex[0];
  const aY = simplex[1];
  const aZ = simplex[2];
  const abX = simplex[3] - aX;
  const abY = simplex[4] - aY;
  const abZ = simplex[5] - aZ;
  const lengthSquared = abX * abX + abY * abY + abZ * abZ;
  if (lengthSquared <= 0) {
    out[0] = aX;
    out[1] = aY;
    out[2] = aZ;
    return writeReduction(1, 0, 0, 0, 1, 0, 0);
  }

  const t = -(aX * abX + aY * abY + aZ * abZ) / lengthSquared;
  if (t <= 0) {
    out[0] = aX;
    out[1] = aY;
    out[2] = aZ;
    return writeReduction(1, 0, 0, 0, 1, 0, 0);
  }
  if (t >= 1) {
    out[0] = simplex[3];
    out[1] = simplex[4];
    out[2] = simplex[5];
    return writeReduction(1, 1, 0, 0, 1, 0, 0);
  }
  out[0] = aX + abX * t;
  out[1] = aY + abY * t;
  out[2] = aZ + abZ * t;
  return writeReduction(2, 0, 1, 0, 1 - t, t, 0);
}

// The closest point on a tetrahedron: the origin is either inside it, or outside at least one face and
// then closest to the nearest of those faces.
//
// Each face is oriented against the vertex it does NOT contain, which is interior by construction. That
// is the same rule EPA needs and for the same reason — testing a face's side by the sign of its own plane
// distance reads a number that is exactly zero when the origin lies ON the face, and zero carries no sign.
function reduceTetrahedron(out: number[]): number {
  let bestDistanceSquared = Infinity;
  let outside = false;

  for (let face = 0; face < 4; face += 1) {
    const i0 = TETRAHEDRON_FACES[face * 4];
    const i1 = TETRAHEDRON_FACES[face * 4 + 1];
    const i2 = TETRAHEDRON_FACES[face * 4 + 2];
    const opposite = TETRAHEDRON_FACES[face * 4 + 3];
    if (!isOriginOutsideFace(i0, i1, i2, opposite)) continue;

    outside = true;
    reduceTriangle(i0, i1, i2, scratchFaceClosest);
    const distanceSquared =
      scratchFaceClosest[0] * scratchFaceClosest[0] +
      scratchFaceClosest[1] * scratchFaceClosest[1] +
      scratchFaceClosest[2] * scratchFaceClosest[2];
    if (distanceSquared >= bestDistanceSquared) continue;

    bestDistanceSquared = distanceSquared;
    out[0] = scratchFaceClosest[0];
    out[1] = scratchFaceClosest[1];
    out[2] = scratchFaceClosest[2];
    // The winning face's reduction has to be SAVED rather than recomputed, because the next face
    // overwrites it in place — and restored at the end, since a later face may win and then lose.
    bestReducedCount = reducedCount;
    for (let slot = 0; slot < reducedCount; slot += 1) {
      bestReducedIndices[slot] = reducedIndices[slot];
      bestReducedWeights[slot] = reducedWeights[slot];
    }
  }

  if (!outside) return 4;

  reducedCount = bestReducedCount;
  for (let slot = 0; slot < bestReducedCount; slot += 1) {
    reducedIndices[slot] = bestReducedIndices[slot];
    reducedWeights[slot] = bestReducedWeights[slot];
  }
  return reducedCount;
}

// The closest point on the triangle at the three given simplex slots.
function reduceTriangle(i0: number, i1: number, i2: number, out: number[]): number {
  const aX = simplex[i0 * 3];
  const aY = simplex[i0 * 3 + 1];
  const aZ = simplex[i0 * 3 + 2];
  const bX = simplex[i1 * 3];
  const bY = simplex[i1 * 3 + 1];
  const bZ = simplex[i1 * 3 + 2];
  const cX = simplex[i2 * 3];
  const cY = simplex[i2 * 3 + 1];
  const cZ = simplex[i2 * 3 + 2];

  const abX = bX - aX;
  const abY = bY - aY;
  const abZ = bZ - aZ;
  const acX = cX - aX;
  const acY = cY - aY;
  const acZ = cZ - aZ;

  // Against vertex A: the origin is in A's region when it lies behind both edges leaving A.
  const d1 = abX * -aX + abY * -aY + abZ * -aZ;
  const d2 = acX * -aX + acY * -aY + acZ * -aZ;
  if (d1 <= 0 && d2 <= 0) return writeTriangleVertex(aX, aY, aZ, i0, out);

  const d3 = abX * -bX + abY * -bY + abZ * -bZ;
  const d4 = acX * -bX + acY * -bY + acZ * -bZ;
  if (d3 >= 0 && d4 <= d3) return writeTriangleVertex(bX, bY, bZ, i1, out);

  const d5 = abX * -cX + abY * -cY + abZ * -cZ;
  const d6 = acX * -cX + acY * -cY + acZ * -cZ;
  if (d6 >= 0 && d5 <= d6) return writeTriangleVertex(cX, cY, cZ, i2, out);

  // Against edge AB, then AC, then BC. Each `v*` is the barycentric weight of the vertex OPPOSITE that
  // edge; a non-positive weight puts the origin outside the triangle on that side.
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return writeTriangleEdge(aX, aY, aZ, abX, abY, abZ, t, i0, i1, out);
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return writeTriangleEdge(aX, aY, aZ, acX, acY, acZ, t, i0, i2, out);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return writeTriangleEdge(bX, bY, bZ, cX - bX, cY - bY, cZ - bZ, t, i1, i2, out);
  }

  // Inside the triangle's own plane region: all three weights positive.
  const denominator = va + vb + vc;
  if (!(denominator > 0)) return writeTriangleVertex(aX, aY, aZ, i0, out);
  const v = vb / denominator;
  const w = vc / denominator;
  out[0] = aX + abX * v + acX * w;
  out[1] = aY + abY * v + acY * w;
  out[2] = aZ + abZ * v + acZ * w;
  return writeReduction(3, i0, i1, i2, 1 - v - w, v, w);
}

function writeReduction(count: number, i0: number, i1: number, i2: number, w0: number, w1: number, w2: number): number {
  reducedCount = count;
  reducedIndices[0] = i0;
  reducedIndices[1] = i1;
  reducedIndices[2] = i2;
  reducedWeights[0] = w0;
  reducedWeights[1] = w1;
  reducedWeights[2] = w2;
  return count;
}

// Records the newest support pair at `slot`, keeping the difference and the two halves it came from in
// step. The offset belongs to A alone, so it is applied to A's stored half as well as to the difference —
// which is what puts the reported witness in the same frame the query was posed in.
function writeSimplexVertex(slot: number, offsetX: number, offsetY: number, offsetZ: number): void {
  simplexA[slot * 3] = scratchSupportA[0] + offsetX;
  simplexA[slot * 3 + 1] = scratchSupportA[1] + offsetY;
  simplexA[slot * 3 + 2] = scratchSupportA[2] + offsetZ;
  simplexB[slot * 3] = scratchSupportB[0];
  simplexB[slot * 3 + 1] = scratchSupportB[1];
  simplexB[slot * 3 + 2] = scratchSupportB[2];
  simplex[slot * 3] = simplexA[slot * 3] - scratchSupportB[0];
  simplex[slot * 3 + 1] = simplexA[slot * 3 + 1] - scratchSupportB[1];
  simplex[slot * 3 + 2] = simplexA[slot * 3 + 2] - scratchSupportB[2];
}

function writeTriangleEdge(
  originX: number,
  originY: number,
  originZ: number,
  edgeX: number,
  edgeY: number,
  edgeZ: number,
  t: number,
  keepFirst: number,
  keepSecond: number,
  out: number[],
): number {
  out[0] = originX + edgeX * t;
  out[1] = originY + edgeY * t;
  out[2] = originZ + edgeZ * t;
  return writeReduction(2, keepFirst, keepSecond, 0, 1 - t, t, 0);
}

function writeTriangleVertex(x: number, y: number, z: number, keep: number, out: number[]): number {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return writeReduction(1, keep, 0, 0, 1, 0, 0);
}

// The closest point on each shape, as the barycentric combination of the support points the surviving
// simplex vertices were built from. The weights are the same ones that place the closest point on the
// difference, which is what makes the two results consistent: their separation is the reported distance
// along the reported direction, by construction rather than by a second measurement.
function writeWitnessPoints(out: CollisionDistance3D): void {
  let pointAX = 0;
  let pointAY = 0;
  let pointAZ = 0;
  let pointBX = 0;
  let pointBY = 0;
  let pointBZ = 0;
  for (let slot = 0; slot < reducedCount; slot += 1) {
    const weight = reducedWeights[slot];
    pointAX += simplexA[slot * 3] * weight;
    pointAY += simplexA[slot * 3 + 1] * weight;
    pointAZ += simplexA[slot * 3 + 2] * weight;
    pointBX += simplexB[slot * 3] * weight;
    pointBY += simplexB[slot * 3 + 1] * weight;
    pointBZ += simplexB[slot * 3 + 2] * weight;
  }
  out.pointAX = pointAX;
  out.pointAY = pointAY;
  out.pointAZ = pointAZ;
  out.pointBX = pointBX;
  out.pointBY = pointBY;
  out.pointBZ = pointBZ;
}

// Each row is a face's three vertices plus the vertex opposite it, which orients the face.
const TETRAHEDRON_FACES = [0, 1, 2, 3, 0, 2, 3, 1, 0, 3, 1, 2, 1, 3, 2, 0];

// Relative, so the convergence test means the same thing whether a scene is measured in metres or
// millimetres. Squared quantities are compared, hence the squared use at the callsite.
const DISTANCE_TOLERANCE = 1e-12;

// Absolute floor for calling the difference's closest point the origin itself. Below this the pair is
// touching, which this query reports as overlap: there is no gap and no unique direction.
const DISTANCE_EPSILON = 1e-12;

const MAX_DISTANCE_ITERATIONS = 32;

let reducedCount = 0;

let bestReducedCount = 0;

const bestReducedIndices = [0, 0, 0];

const bestReducedWeights = [0, 0, 0];

const reducedIndices = [0, 0, 0];

const reducedWeights = [0, 0, 0];

const scratchClosest = [0, 0, 0];

const scratchCompact = [0, 0, 0, 0, 0, 0, 0, 0, 0];

const scratchCompactA = [0, 0, 0, 0, 0, 0, 0, 0, 0];

const scratchCompactB = [0, 0, 0, 0, 0, 0, 0, 0, 0];

const scratchFaceClosest = [0, 0, 0];

const scratchSupportA = [0, 0, 0];

const scratchSupportB = [0, 0, 0];

const simplex = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const simplexA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

const simplexB = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
