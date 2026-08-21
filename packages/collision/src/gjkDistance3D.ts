import type { CollisionDistance3D, CollisionShape3D } from '@flighthq/types/contract';

import { getCollisionSupport3D } from './collisionSupport3D';

// The DISTANCE between two convex shapes, and the direction along which they are closest.
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

export function createCollisionDistance3D(): CollisionDistance3D {
  return { distance: 0, directionX: 0, directionY: 0, directionZ: 0, overlapping: false };
}

// Writes the distance between `a` and `b` and the unit direction of closest approach, pointing from B
// toward A — the axis along which separating them is cheapest, and the same orientation a contact normal
// uses. Returns false when the shapes OVERLAP or when either kind has no registered support, in which
// case the distance is 0 and the direction is left zeroed: there is no gap and no unique axis.
//
// The optional offset translates `a` before measuring, which is what a swept query needs: only the
// RELATIVE placement of the pair affects the answer, so one offset expresses both shapes moving. Passing
// it costs nothing over building a translated copy of the shape, and a shape has no translate operation
// that would not have to know every kind.
export function writeCollisionDistance3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionDistance3D,
  offsetX = 0,
  offsetY = 0,
  offsetZ = 0,
): boolean {
  out.distance = 0;
  out.directionX = 0;
  out.directionY = 0;
  out.directionZ = 0;
  out.overlapping = false;

  const supportA = getCollisionSupport3D(a.kind);
  const supportB = getCollisionSupport3D(b.kind);
  if (supportA === null || supportB === null) return false;

  // Seed with any support point; the first iteration replaces the direction with a real one.
  supportA(a, 1, 0, 0, scratchSupportA);
  supportB(b, -1, 0, 0, scratchSupportB);
  simplex[0] = scratchSupportA[0] + offsetX - scratchSupportB[0];
  simplex[1] = scratchSupportA[1] + offsetY - scratchSupportB[1];
  simplex[2] = scratchSupportA[2] + offsetZ - scratchSupportB[2];
  let count = 1;

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

    simplex[count * 3] = nextX;
    simplex[count * 3 + 1] = nextY;
    simplex[count * 3 + 2] = nextZ;
    count += 1;

    count = writeClosestPointOnSimplex(count, scratchClosest);
    closestX = scratchClosest[0];
    closestY = scratchClosest[1];
    closestZ = scratchClosest[2];
    if (count === 4) {
      // A tetrahedron that did not reduce encloses the origin.
      out.overlapping = true;
      return false;
    }
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
  return true;
}

// Reduces the simplex to the smallest subset whose hull contains the point closest to the ORIGIN, writes
// that point into `out`, and returns the reduced size. Returns 4 without reducing when a tetrahedron
// encloses the origin, which the caller reads as overlap.
//
// Each case is a Voronoi-region decomposition solved in barycentric coordinates rather than by
// projecting and testing: the weights say which feature owns the closest point AND where on it, so one
// set of arithmetic answers both.
function writeClosestPointOnSimplex(count: number, out: number[]): number {
  if (count === 1) {
    out[0] = simplex[0];
    out[1] = simplex[1];
    out[2] = simplex[2];
    return 1;
  }
  if (count === 2) return writeClosestPointOnSegment(out);
  if (count === 3) return writeClosestPointOnTriangle(0, 1, 2, out, true);
  return writeClosestPointOnTetrahedron(out);
}

function writeClosestPointOnSegment(out: number[]): number {
  const aX = simplex[0];
  const aY = simplex[1];
  const aZ = simplex[2];
  const bX = simplex[3];
  const bY = simplex[4];
  const bZ = simplex[5];
  const abX = bX - aX;
  const abY = bY - aY;
  const abZ = bZ - aZ;
  const lengthSquared = abX * abX + abY * abY + abZ * abZ;
  if (lengthSquared <= 0) {
    out[0] = aX;
    out[1] = aY;
    out[2] = aZ;
    return 1;
  }

  let t = -(aX * abX + aY * abY + aZ * abZ) / lengthSquared;
  if (t <= 0) {
    out[0] = aX;
    out[1] = aY;
    out[2] = aZ;
    return 1;
  }
  if (t >= 1) {
    // B owns the closest point, so B becomes the whole simplex.
    simplex[0] = bX;
    simplex[1] = bY;
    simplex[2] = bZ;
    out[0] = bX;
    out[1] = bY;
    out[2] = bZ;
    return 1;
  }
  out[0] = aX + abX * t;
  out[1] = aY + abY * t;
  out[2] = aZ + abZ * t;
  return 2;
}

// The closest point on the triangle at the three given simplex slots. When `compact` is set the simplex
// is rewritten to the owning feature; the tetrahedron case clears that, because it evaluates several
// faces before choosing and must not disturb the simplex until it has.
function writeClosestPointOnTriangle(i0: number, i1: number, i2: number, out: number[], compact: boolean): number {
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
  if (d1 <= 0 && d2 <= 0) return writeTriangleVertex(aX, aY, aZ, i0, out, compact);

  const d3 = abX * -bX + abY * -bY + abZ * -bZ;
  const d4 = acX * -bX + acY * -bY + acZ * -bZ;
  if (d3 >= 0 && d4 <= d3) return writeTriangleVertex(bX, bY, bZ, i1, out, compact);

  const d5 = abX * -cX + abY * -cY + abZ * -cZ;
  const d6 = acX * -cX + acY * -cY + acZ * -cZ;
  if (d6 >= 0 && d5 <= d6) return writeTriangleVertex(cX, cY, cZ, i2, out, compact);

  // Against edge AB, then AC, then BC. Each `v*` is the barycentric weight of the vertex OPPOSITE that
  // edge; a non-positive weight puts the origin outside the triangle on that side.
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const t = d1 / (d1 - d3);
    return writeTriangleEdge(aX, aY, aZ, abX, abY, abZ, t, i0, i1, out, compact);
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const t = d2 / (d2 - d6);
    return writeTriangleEdge(aX, aY, aZ, acX, acY, acZ, t, i0, i2, out, compact);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const t = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return writeTriangleEdge(bX, bY, bZ, cX - bX, cY - bY, cZ - bZ, t, i1, i2, out, compact);
  }

  // Inside the triangle's own plane region: all three weights positive.
  const denominator = va + vb + vc;
  if (!(denominator > 0)) return writeTriangleVertex(aX, aY, aZ, i0, out, compact);
  const v = vb / denominator;
  const w = vc / denominator;
  out[0] = aX + abX * v + acX * w;
  out[1] = aY + abY * v + acY * w;
  out[2] = aZ + abZ * v + acZ * w;
  if (compact) {
    writeSimplexFrom(i0, i1, i2);
    return 3;
  }
  return 3;
}

// The closest point on a tetrahedron: the origin is either inside it, or outside at least one face and
// then closest to the nearest of those faces.
//
// Each face is oriented against the vertex it does NOT contain, which is interior by construction. That
// is the same rule EPA needs and for the same reason — testing a face's side by the sign of its own plane
// distance reads a number that is exactly zero when the origin lies ON the face, and zero carries no sign.
function writeClosestPointOnTetrahedron(out: number[]): number {
  let bestDistanceSquared = Infinity;
  let bestCount = 0;
  let outside = false;

  for (let face = 0; face < 4; face += 1) {
    const i0 = TETRAHEDRON_FACES[face * 4];
    const i1 = TETRAHEDRON_FACES[face * 4 + 1];
    const i2 = TETRAHEDRON_FACES[face * 4 + 2];
    const opposite = TETRAHEDRON_FACES[face * 4 + 3];
    if (!isOriginOutsideFace(i0, i1, i2, opposite)) continue;

    outside = true;
    const faceCount = writeClosestPointOnTriangle(i0, i1, i2, scratchFaceClosest, false);
    const distanceSquared =
      scratchFaceClosest[0] * scratchFaceClosest[0] +
      scratchFaceClosest[1] * scratchFaceClosest[1] +
      scratchFaceClosest[2] * scratchFaceClosest[2];
    if (distanceSquared >= bestDistanceSquared) continue;

    bestDistanceSquared = distanceSquared;
    out[0] = scratchFaceClosest[0];
    out[1] = scratchFaceClosest[1];
    out[2] = scratchFaceClosest[2];
    // Record the winning face's own vertices, and only commit them to the simplex once every face has
    // been weighed — compacting mid-loop would rewrite the points a later face still has to read.
    bestCount = faceCount;
    bestFace[0] = i0;
    bestFace[1] = i1;
    bestFace[2] = i2;
  }

  if (!outside) return 4;

  // Re-run the winner with compaction on, now that nothing else needs the original simplex.
  const count = writeClosestPointOnTriangle(bestFace[0], bestFace[1], bestFace[2], out, true);
  return count === 0 ? bestCount : count;
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

function containsSimplexPoint(count: number, x: number, y: number, z: number): boolean {
  for (let i = 0; i < count; i += 1) {
    if (simplex[i * 3] === x && simplex[i * 3 + 1] === y && simplex[i * 3 + 2] === z) return true;
  }
  return false;
}

function writeSimplexFrom(i0: number, i1: number, i2: number): void {
  for (let slot = 0; slot < 3; slot += 1) {
    const source = slot === 0 ? i0 : slot === 1 ? i1 : i2;
    scratchCompact[slot * 3] = simplex[source * 3];
    scratchCompact[slot * 3 + 1] = simplex[source * 3 + 1];
    scratchCompact[slot * 3 + 2] = simplex[source * 3 + 2];
  }
  for (let i = 0; i < 9; i += 1) simplex[i] = scratchCompact[i];
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
  compact: boolean,
): number {
  out[0] = originX + edgeX * t;
  out[1] = originY + edgeY * t;
  out[2] = originZ + edgeZ * t;
  if (compact) {
    const firstX = simplex[keepFirst * 3];
    const firstY = simplex[keepFirst * 3 + 1];
    const firstZ = simplex[keepFirst * 3 + 2];
    const secondX = simplex[keepSecond * 3];
    const secondY = simplex[keepSecond * 3 + 1];
    const secondZ = simplex[keepSecond * 3 + 2];
    simplex[0] = firstX;
    simplex[1] = firstY;
    simplex[2] = firstZ;
    simplex[3] = secondX;
    simplex[4] = secondY;
    simplex[5] = secondZ;
  }
  return 2;
}

function writeTriangleVertex(x: number, y: number, z: number, keep: number, out: number[], compact: boolean): number {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  if (compact) {
    simplex[0] = simplex[keep * 3];
    simplex[1] = simplex[keep * 3 + 1];
    simplex[2] = simplex[keep * 3 + 2];
  }
  return 1;
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

const bestFace = [0, 0, 0];

const scratchClosest = [0, 0, 0];

const scratchCompact = [0, 0, 0, 0, 0, 0, 0, 0, 0];

const scratchFaceClosest = [0, 0, 0];

const scratchSupportA = [0, 0, 0];

const scratchSupportB = [0, 0, 0];

const simplex = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
