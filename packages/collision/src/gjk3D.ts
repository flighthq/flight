import type { CollisionManifold3D, CollisionShape3D, CollisionSupport3D } from '@flighthq/types/contract';

import { getCollisionSupport3D } from './collisionSupport3D';
import { clearCollisionManifold3D } from './manifold3D';

// The generic 3D narrow-phase floor: GJK for overlap, EPA for the penetration that follows it.
//
// This is the 2D core's design instantiated for three dimensions, NOT a dimension-erased core shared
// with it. That distinction is `agents/collision-support-registry.md`'s and it is structural rather
// than stylistic: a C support function is `support(const Shape*, const float* dir, float* out)`, and a
// single width-parameterized core would lower to something where nothing stops a 2-vector reaching a
// 3-vector's slot. Two concretely-typed families lower to `gjk2d` / `gjk3d` with their types intact.
//
// What actually changes with the extra axis is the SIMPLEX and the POLYTOPE, and both grow a dimension:
// GJK's simplex terminates on a tetrahedron rather than a triangle, and EPA expands a surface of
// TRIANGLES rather than a loop of edges — so its expansion step has to cut a horizon out of the visible
// faces instead of splitting one edge in two. Everything else is the same algorithm.
//
// The Minkowski difference `A - B` is the object both algorithms work on, and neither ever builds it:
// its support in direction `d` is `supportA(d) - supportB(-d)`, one call each. The origin lies inside
// it exactly when the shapes overlap, and the shortest vector from the origin to its boundary is the
// penetration.

// The generic manifold path: GJK for overlap, then EPA for the minimum-translation normal and depth.
// Writes the normal oriented to push **A out of B**, matching every specialized pair.
//
// Returns false — and clears `out` — when either kind has no registered support, when the shapes are
// disjoint, or when EPA cannot find a boundary to measure at all.
//
// ACCURACY depends on whether the boundary is flat, and the difference is large enough to plan around:
//
//   - On POLYTOPES — box, aabb, convex hull — the answer is EXACT. The Minkowski difference of two
//     polytopes is a polytope, so a finite expansion reaches its true face and stops there. Measured:
//     a 0.5 box overlap reports 0.5 and a normal of exactly (-1,0,0).
//   - On CURVED boundaries — sphere, capsule — EPA inscribes a polytope in a surface it can only
//     approach, and the error is set by the VERTEX BUDGET rather than by `EPA_TOLERANCE`: a sphere
//     needs far more vertices than `MAX_POLYTOPE_VERTICES` to reach the tolerance, so the budget binds
//     first. THE DEPTH AND THE NORMAL DO NOT CONVERGE ALIKE, and the gap is about a square root:
//     measured, two spheres overlapping by 0.5 report a depth of 0.4999892 (1e-5 out) with a normal
//     tilted by 5e-3. Distance is second-order insensitive to angular error — tilting the normal by
//     theta on a sphere of radius r changes the distance by only `r * theta^2 / 2` — so a depth driven
//     to 1e-5 leaves the direction near its square root, and no tolerance chases it without a vertex
//     budget that makes the whole search pointless.
//
// Neither is a defect, but the second is a reason to register a pair specialization: a sphere-sphere
// penetration has a three-operation closed form that is exact, and going through here instead buys an
// iterative solve and 1e-5 of error.
export function testCollisionSupport3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionManifold3D,
): boolean {
  clearCollisionManifold3D(out);
  const supportA = getCollisionSupport3D(a.kind);
  const supportB = getCollisionSupport3D(b.kind);
  if (supportA === null || supportB === null) return false;
  if (runGjk3D(a, supportA, b, supportB) !== GJK_OVERLAPPING) return false;
  return writeEpa3DPenetration(a, supportA, b, supportB, out);
}

// Whether two shapes overlap, by GJK. Returns false when either kind has no registered support — an
// unregistered kind cannot be tested, and reporting "not overlapping" is the package's standing
// sentinel for that.
//
// Touching counts as NOT overlapping, matching every other test in the package.
export function testCollisionSupportOverlap3D(a: Readonly<CollisionShape3D>, b: Readonly<CollisionShape3D>): boolean {
  const supportA = getCollisionSupport3D(a.kind);
  const supportB = getCollisionSupport3D(b.kind);
  if (supportA === null || supportB === null) return false;
  return runGjk3D(a, supportA, b, supportB) === GJK_OVERLAPPING;
}

// Adds a face, computing its outward normal and distance from the origin.
//
// OUTWARD IS DECIDED AGAINST THE POLYTOPE'S INTERIOR POINT, NOT AGAINST THE ORIGIN, and that choice is
// load-bearing rather than stylistic. Orienting by the origin — flipping whenever `dot(normal, a)` is
// negative — reads the sign of a number that is exactly ZERO whenever the origin lies ON the face, and
// zero carries no sign. That is not a rare case: two spheres whose centres share an axis terminate GJK
// on a tetrahedron with the origin sitting on one of its faces, which is as ordinary a configuration
// as there is. The face's normal then points inward as often as out, EPA searches away from the
// boundary it meant to find, and the pair reports a penetration depth of zero while GJK insists the
// two overlap.
//
// The centroid of the initial tetrahedron has no such degeneracy — it is strictly interior by
// construction — and it stays interior as the polytope only ever grows, so one interior point orients
// every face for the whole expansion.
//
// A face whose winding gives the inward normal is flipped rather than rejected, because the horizon
// loop below produces both windings depending on which side it cut from. FLIPPING THE NORMAL MEANS
// SWAPPING TWO VERTICES TOO, and that pairing is not bookkeeping — it is what makes the horizon close.
// The horizon cancels an interior edge by seeing it traversed once in each direction, which holds only
// while every face's stored winding agrees with its outward normal. Flip one without the other and two
// adjacent faces walk their shared edge the same way, nothing cancels, and the expansion stitches a
// self-intersecting surface out of a visible set it has silently mis-measured — after which EPA reports
// whatever the wreckage says, with no error anywhere.
//
// Returns false for a degenerate (zero-area) face, which is dropped rather than stored: its normal is
// meaningless and would poison the closest-face scan.
function addEpaFace(vertexA: number, vertexB: number, vertexC: number): boolean {
  if (faceCount >= MAX_EPA_FACES) return false;
  const ax = polytope[vertexA * 3];
  const ay = polytope[vertexA * 3 + 1];
  const az = polytope[vertexA * 3 + 2];
  const abX = polytope[vertexB * 3] - ax;
  const abY = polytope[vertexB * 3 + 1] - ay;
  const abZ = polytope[vertexB * 3 + 2] - az;
  const acX = polytope[vertexC * 3] - ax;
  const acY = polytope[vertexC * 3 + 1] - ay;
  const acZ = polytope[vertexC * 3 + 2] - az;
  let normalX = abY * acZ - abZ * acY;
  let normalY = abZ * acX - abX * acZ;
  let normalZ = abX * acY - abY * acX;
  const length = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
  if (length <= EPSILON) return false;
  normalX /= length;
  normalY /= length;
  normalZ /= length;
  let windingB = vertexB;
  let windingC = vertexC;
  if (normalX * (ax - interiorX) + normalY * (ay - interiorY) + normalZ * (az - interiorZ) < 0) {
    normalX = -normalX;
    normalY = -normalY;
    normalZ = -normalZ;
    windingB = vertexC;
    windingC = vertexB;
  }
  // Distance from the ORIGIN to the face plane, along the now-outward normal. Zero is a legitimate
  // value — it means the origin lies on this face — and is exactly the reading the origin-oriented
  // form could not produce a usable normal for.
  const distance = ax * normalX + ay * normalY + az * normalZ;
  faceVertices[faceCount * 3] = vertexA;
  faceVertices[faceCount * 3 + 1] = windingB;
  faceVertices[faceCount * 3 + 2] = windingC;
  faceNormals[faceCount * 3] = normalX;
  faceNormals[faceCount * 3 + 1] = normalY;
  faceNormals[faceCount * 3 + 2] = normalZ;
  faceDistances[faceCount] = distance;
  faceCount += 1;
  return true;
}

// Records one horizon edge, cancelling it against its reverse if that is already recorded.
//
// An edge shared by two REMOVED faces is interior to the hole and must not be re-stitched; an edge
// shared by one removed and one surviving face is the hole's rim. The two cases are told apart by
// exactly this: an interior edge is walked twice, once in each direction, so the pair cancels. This is
// the step with no 2D counterpart — in two dimensions the "hole" is always a single edge.
function recordHorizonEdge(from: number, to: number): void {
  for (let i = 0; i < horizonCount; i += 1) {
    if (horizonEdges[i * 2] === to && horizonEdges[i * 2 + 1] === from) {
      horizonEdges[i * 2] = horizonEdges[(horizonCount - 1) * 2];
      horizonEdges[i * 2 + 1] = horizonEdges[(horizonCount - 1) * 2 + 1];
      horizonCount -= 1;
      return;
    }
  }
  if (horizonCount >= MAX_EPA_HORIZON_EDGES) return;
  horizonEdges[horizonCount * 2] = from;
  horizonEdges[horizonCount * 2 + 1] = to;
  horizonCount += 1;
}

// Runs GJK until its simplex encloses the origin or it proves the origin is unreachable, leaving the
// final simplex in `simplex`. Returns `GJK_OVERLAPPING` or `GJK_SEPARATED`.
//
// The search direction starts from the first support point rather than a fixed axis, so a pair already
// far apart on one axis is rejected in the first iteration instead of walking there.
function runGjk3D(
  a: Readonly<CollisionShape3D>,
  supportA: CollisionSupport3D,
  b: Readonly<CollisionShape3D>,
  supportB: CollisionSupport3D,
): number {
  writeMinkowskiSupport3D(a, supportA, b, supportB, 1, 0, 0, minkowski);
  simplex[0] = minkowski[0];
  simplex[1] = minkowski[1];
  simplex[2] = minkowski[2];
  simplexCount = 1;
  let directionX = -simplex[0];
  let directionY = -simplex[1];
  let directionZ = -simplex[2];

  for (let iteration = 0; iteration < MAX_GJK_ITERATIONS; iteration += 1) {
    if (directionX === 0 && directionY === 0 && directionZ === 0) {
      // The origin is ON the current feature. Touching, not overlapping — the same answer every other
      // test in the package gives for a pair that merely grazes.
      return GJK_SEPARATED;
    }
    writeMinkowskiSupport3D(a, supportA, b, supportB, directionX, directionY, directionZ, minkowski);
    if (minkowski[0] * directionX + minkowski[1] * directionY + minkowski[2] * directionZ <= 0) {
      return GJK_SEPARATED;
    }
    simplex[simplexCount * 3] = minkowski[0];
    simplex[simplexCount * 3 + 1] = minkowski[1];
    simplex[simplexCount * 3 + 2] = minkowski[2];
    simplexCount += 1;

    if (updateGjk3DSimplex()) return GJK_OVERLAPPING;
    directionX = searchDirection[0];
    directionY = searchDirection[1];
    directionZ = searchDirection[2];
  }
  return GJK_SEPARATED;
}

// Reduces the simplex toward the origin and writes the next search direction into `searchDirection`.
// Returns true when the simplex is a tetrahedron containing the origin.
//
// The newest point is always A, the last one added, and every case asks the same question: which
// Voronoi region of the simplex contains the origin? Regions behind A are unreachable — A was chosen
// as the furthest point toward the origin, so the origin cannot lie beyond it — which is why no case
// ever tests the features not touching A.
function updateGjk3DSimplex(): boolean {
  const last = simplexCount - 1;
  const ax = simplex[last * 3];
  const ay = simplex[last * 3 + 1];
  const az = simplex[last * 3 + 2];
  // The vector from A toward the origin, which every region test is measured against.
  const aoX = -ax;
  const aoY = -ay;
  const aoZ = -az;

  if (simplexCount === 2) {
    const bx = simplex[0];
    const by = simplex[1];
    const bz = simplex[2];
    const abX = bx - ax;
    const abY = by - ay;
    const abZ = bz - az;
    if (abX * aoX + abY * aoY + abZ * aoZ > 0) {
      // Perpendicular to AB, in the plane of AB and AO: `(AB x AO) x AB`.
      writeTripleProduct(abX, abY, abZ, aoX, aoY, aoZ, abX, abY, abZ, searchDirection);
      if (isNearZeroVector(searchDirection)) {
        // The origin is COLLINEAR with the segment. That proves nothing on its own — a 1-simplex
        // through the origin is still only a line inside a solid — so any perpendicular carries the
        // search on. Treating it as separation is the 2D core's documented bug, here in three
        // dimensions where a whole plane of perpendiculars is available.
        writeAnyPerpendicular(abX, abY, abZ, searchDirection);
      }
      return false;
    }
    simplex[0] = ax;
    simplex[1] = ay;
    simplex[2] = az;
    simplexCount = 1;
    searchDirection[0] = aoX;
    searchDirection[1] = aoY;
    searchDirection[2] = aoZ;
    return false;
  }

  if (simplexCount === 3) {
    return updateGjk3DTriangle(ax, ay, az, aoX, aoY, aoZ);
  }

  // Tetrahedron: A plus the triangle BCD. The origin is either beyond one of the three faces touching
  // A, or enclosed. Face BCD cannot be the answer — it is the face A was built away from.
  const dIndex = 0;
  const cIndex = 1;
  const bIndex = 2;
  for (let face = 0; face < 3; face += 1) {
    const firstIndex = face === 0 ? bIndex : face === 1 ? cIndex : dIndex;
    const secondIndex = face === 0 ? cIndex : face === 1 ? dIndex : bIndex;
    const firstX = simplex[firstIndex * 3];
    const firstY = simplex[firstIndex * 3 + 1];
    const firstZ = simplex[firstIndex * 3 + 2];
    const secondX = simplex[secondIndex * 3];
    const secondY = simplex[secondIndex * 3 + 1];
    const secondZ = simplex[secondIndex * 3 + 2];
    const e1X = firstX - ax;
    const e1Y = firstY - ay;
    const e1Z = firstZ - az;
    const e2X = secondX - ax;
    const e2Y = secondY - ay;
    const e2Z = secondZ - az;
    let normalX = e1Y * e2Z - e1Z * e2Y;
    let normalY = e1Z * e2X - e1X * e2Z;
    let normalZ = e1X * e2Y - e1Y * e2X;
    // Orient the face normal away from the fourth vertex, so "outside" means outside the tetrahedron
    // rather than outside whichever winding the support search happened to produce.
    const thirdIndex = face === 0 ? dIndex : face === 1 ? bIndex : cIndex;
    const towardThirdX = simplex[thirdIndex * 3] - ax;
    const towardThirdY = simplex[thirdIndex * 3 + 1] - ay;
    const towardThirdZ = simplex[thirdIndex * 3 + 2] - az;
    if (normalX * towardThirdX + normalY * towardThirdY + normalZ * towardThirdZ > 0) {
      normalX = -normalX;
      normalY = -normalY;
      normalZ = -normalZ;
    }
    if (normalX * aoX + normalY * aoY + normalZ * aoZ > 0) {
      // Keep the triangle A + this face's two vertices, ordered so A stays last.
      simplex[0] = secondX;
      simplex[1] = secondY;
      simplex[2] = secondZ;
      simplex[3] = firstX;
      simplex[4] = firstY;
      simplex[5] = firstZ;
      simplex[6] = ax;
      simplex[7] = ay;
      simplex[8] = az;
      simplexCount = 3;
      return updateGjk3DTriangle(ax, ay, az, aoX, aoY, aoZ);
    }
  }
  return true;
}

// The triangle case, shared by the 3-simplex step and by the tetrahedron step that reduces to it.
// `simplex` holds C, B, A in that order.
function updateGjk3DTriangle(ax: number, ay: number, az: number, aoX: number, aoY: number, aoZ: number): boolean {
  const cx = simplex[0];
  const cy = simplex[1];
  const cz = simplex[2];
  const bx = simplex[3];
  const by = simplex[4];
  const bz = simplex[5];
  const abX = bx - ax;
  const abY = by - ay;
  const abZ = bz - az;
  const acX = cx - ax;
  const acY = cy - ay;
  const acZ = cz - az;
  const normalX = abY * acZ - abZ * acY;
  const normalY = abZ * acX - abX * acZ;
  const normalZ = abX * acY - abY * acX;

  // Beyond edge AC: the direction perpendicular to AC that points at the origin.
  const acSideX = normalY * acZ - normalZ * acY;
  const acSideY = normalZ * acX - normalX * acZ;
  const acSideZ = normalX * acY - normalY * acX;
  if (acSideX * aoX + acSideY * aoY + acSideZ * aoZ > 0) {
    simplex[3] = ax;
    simplex[4] = ay;
    simplex[5] = az;
    simplexCount = 2;
    writeTripleProduct(acX, acY, acZ, aoX, aoY, aoZ, acX, acY, acZ, searchDirection);
    return false;
  }

  // Beyond edge AB.
  const abSideX = abY * normalZ - abZ * normalY;
  const abSideY = abZ * normalX - abX * normalZ;
  const abSideZ = abX * normalY - abY * normalX;
  if (abSideX * aoX + abSideY * aoY + abSideZ * aoZ > 0) {
    simplex[0] = bx;
    simplex[1] = by;
    simplex[2] = bz;
    simplex[3] = ax;
    simplex[4] = ay;
    simplex[5] = az;
    simplexCount = 2;
    writeTripleProduct(abX, abY, abZ, aoX, aoY, aoZ, abX, abY, abZ, searchDirection);
    return false;
  }

  // Above or below the face. A triangle cannot contain the origin in three dimensions, so the search
  // continues perpendicular to it, toward whichever side the origin is on.
  if (normalX * aoX + normalY * aoY + normalZ * aoZ > 0) {
    searchDirection[0] = normalX;
    searchDirection[1] = normalY;
    searchDirection[2] = normalZ;
  } else {
    // Swap B and C so the winding follows the search direction, keeping the tetrahedron case's
    // orientation assumptions intact.
    simplex[0] = bx;
    simplex[1] = by;
    simplex[2] = bz;
    simplex[3] = cx;
    simplex[4] = cy;
    simplex[5] = cz;
    searchDirection[0] = -normalX;
    searchDirection[1] = -normalY;
    searchDirection[2] = -normalZ;
  }
  if (isNearZeroVector(searchDirection)) writeAnyPerpendicular(abX, abY, abZ, searchDirection);
  return false;
}

// Whether a vector is short enough to carry no usable direction.
function isNearZeroVector(vector: Readonly<number[]>): boolean {
  return Math.abs(vector[0]) <= EPSILON && Math.abs(vector[1]) <= EPSILON && Math.abs(vector[2]) <= EPSILON;
}

// Writes some unit-ish vector perpendicular to the input. Crosses against whichever cardinal axis the
// input is least aligned with, so the result can never collapse to zero.
function writeAnyPerpendicular(x: number, y: number, z: number, out: number[]): void {
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const absZ = Math.abs(z);
  const axisX = absX <= absY && absX <= absZ ? 1 : 0;
  const axisY = axisX === 0 && absY <= absZ ? 1 : 0;
  const axisZ = axisX === 0 && axisY === 0 ? 1 : 0;
  out[0] = y * axisZ - z * axisY;
  out[1] = z * axisX - x * axisZ;
  out[2] = x * axisY - y * axisX;
}

// Writes `(u x v) x w`, the vector rejection form both the line and edge cases use to point at the
// origin without assuming a winding.
function writeTripleProduct(
  ux: number,
  uy: number,
  uz: number,
  vx: number,
  vy: number,
  vz: number,
  wx: number,
  wy: number,
  wz: number,
  out: number[],
): void {
  const crossX = uy * vz - uz * vy;
  const crossY = uz * vx - ux * vz;
  const crossZ = ux * vy - uy * vx;
  out[0] = crossY * wz - crossZ * wy;
  out[1] = crossZ * wx - crossX * wz;
  out[2] = crossX * wy - crossY * wx;
}

// Expands the terminating GJK tetrahedron out to the Minkowski boundary, finding the closest FACE to
// the origin. That face's outward normal and distance ARE the minimum translation.
//
// The sign is the part worth stating, and it is the 2D core's exactly: the closest boundary point sits
// at `normal * distance` from the origin, and translating A by the NEGATIVE of that vector moves the
// origin onto the boundary — which is the definition of just separating. So the manifold normal, which
// must push A out of B, is the negated EPA normal.
function writeEpa3DPenetration(
  a: Readonly<CollisionShape3D>,
  supportA: CollisionSupport3D,
  b: Readonly<CollisionShape3D>,
  supportB: CollisionSupport3D,
  out: CollisionManifold3D,
): boolean {
  if (simplexCount < 4) return false;
  for (let i = 0; i < 12; i += 1) polytope[i] = simplex[i];
  polytopeCount = 4;
  faceCount = 0;
  // The interior point every face is oriented against, fixed before the first face is built and never
  // revised: the polytope only grows, so the initial tetrahedron's centroid stays inside it.
  interiorX = (polytope[0] + polytope[3] + polytope[6] + polytope[9]) / 4;
  interiorY = (polytope[1] + polytope[4] + polytope[7] + polytope[10]) / 4;
  interiorZ = (polytope[2] + polytope[5] + polytope[8] + polytope[11]) / 4;
  addEpaFace(0, 1, 2);
  addEpaFace(0, 1, 3);
  addEpaFace(0, 2, 3);
  addEpaFace(1, 2, 3);
  if (faceCount === 0) return false;

  // Hoisted out of the loop so running out of iterations returns the BEST FACE FOUND rather than
  // nothing. GJK has already decided these shapes overlap; an EPA that gives up would make the two
  // entry points contradict each other about that.
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let bestNormalZ = 0;

  for (let iteration = 0; iteration < MAX_EPA_ITERATIONS; iteration += 1) {
    let closest = -1;
    bestDistance = Number.POSITIVE_INFINITY;
    for (let face = 0; face < faceCount; face += 1) {
      if (faceDistances[face] < bestDistance) {
        bestDistance = faceDistances[face];
        closest = face;
      }
    }
    if (closest < 0) break;
    bestNormalX = faceNormals[closest * 3];
    bestNormalY = faceNormals[closest * 3 + 1];
    bestNormalZ = faceNormals[closest * 3 + 2];

    writeMinkowskiSupport3D(a, supportA, b, supportB, bestNormalX, bestNormalY, bestNormalZ, minkowski);
    const reach = minkowski[0] * bestNormalX + minkowski[1] * bestNormalY + minkowski[2] * bestNormalZ;
    // Converged: the boundary in this direction is where the polytope already says it is.
    if (reach - bestDistance <= EPA_TOLERANCE) break;
    if (polytopeCount >= MAX_POLYTOPE_VERTICES) break;

    // Cut away every face the new point can see, keeping the rim of the hole. A face is visible when
    // the new point lies on its outward side.
    horizonCount = 0;
    for (let face = faceCount - 1; face >= 0; face -= 1) {
      const normalX = faceNormals[face * 3];
      const normalY = faceNormals[face * 3 + 1];
      const normalZ = faceNormals[face * 3 + 2];
      if (minkowski[0] * normalX + minkowski[1] * normalY + minkowski[2] * normalZ - faceDistances[face] <= 0) {
        continue;
      }
      const v0 = faceVertices[face * 3];
      const v1 = faceVertices[face * 3 + 1];
      const v2 = faceVertices[face * 3 + 2];
      recordHorizonEdge(v0, v1);
      recordHorizonEdge(v1, v2);
      recordHorizonEdge(v2, v0);
      removeEpaFace(face);
    }
    if (horizonCount === 0) break;

    const added = polytopeCount;
    polytope[added * 3] = minkowski[0];
    polytope[added * 3 + 1] = minkowski[1];
    polytope[added * 3 + 2] = minkowski[2];
    polytopeCount += 1;
    for (let edge = 0; edge < horizonCount; edge += 1) {
      addEpaFace(horizonEdges[edge * 2], horizonEdges[edge * 2 + 1], added);
    }
    if (faceCount === 0) break;
  }

  if (bestDistance === Number.POSITIVE_INFINITY) return false;
  out.overlapping = true;
  out.normalX = -bestNormalX;
  out.normalY = -bestNormalY;
  out.normalZ = -bestNormalZ;
  out.depth = bestDistance;
  return true;
}

// Drops a face by swapping the last one into its slot. Order carries no meaning here — the scan reads
// every face — so the swap is the cheapest removal and keeps the arrays dense.
function removeEpaFace(face: number): void {
  const last = faceCount - 1;
  if (face !== last) {
    faceVertices[face * 3] = faceVertices[last * 3];
    faceVertices[face * 3 + 1] = faceVertices[last * 3 + 1];
    faceVertices[face * 3 + 2] = faceVertices[last * 3 + 2];
    faceNormals[face * 3] = faceNormals[last * 3];
    faceNormals[face * 3 + 1] = faceNormals[last * 3 + 1];
    faceNormals[face * 3 + 2] = faceNormals[last * 3 + 2];
    faceDistances[face] = faceDistances[last];
  }
  faceCount -= 1;
}

// Writes the support point of the Minkowski difference `A - B` along a direction: the furthest point
// on A one way, minus the furthest point on B the other. The difference is never materialized.
function writeMinkowskiSupport3D(
  a: Readonly<CollisionShape3D>,
  supportA: CollisionSupport3D,
  b: Readonly<CollisionShape3D>,
  supportB: CollisionSupport3D,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: number[],
): void {
  supportA(a, directionX, directionY, directionZ, supportPointA);
  supportB(b, -directionX, -directionY, -directionZ, supportPointB);
  out[0] = supportPointA[0] - supportPointB[0];
  out[1] = supportPointA[1] - supportPointB[1];
  out[2] = supportPointA[2] - supportPointB[2];
}

const GJK_OVERLAPPING = 1;
const GJK_SEPARATED = 0;
// GJK converges in a handful of iterations for convex shapes; the cap guards against a support
// function that is not convex rather than tuning anything.
const MAX_GJK_ITERATIONS = 64;
const MAX_EPA_ITERATIONS = 64;
// The polytope grows by one vertex per iteration, so these bound the scratch rather than the answer's
// quality: hitting one returns the best face found so far. A triangulated closed surface has about
// `2 * vertices` faces, which is what the face cap is sized from.
const MAX_POLYTOPE_VERTICES = 64;
const MAX_EPA_FACES = 128;
const MAX_EPA_HORIZON_EDGES = 128;
const EPA_TOLERANCE = 1e-9;
const EPSILON = 1e-12;

const faceDistances = new Float64Array(MAX_EPA_FACES);
const faceNormals = new Float64Array(MAX_EPA_FACES * 3);
const faceVertices = new Int32Array(MAX_EPA_FACES * 3);
const horizonEdges = new Int32Array(MAX_EPA_HORIZON_EDGES * 2);
const minkowski = [0, 0, 0];
const polytope = new Float64Array(MAX_POLYTOPE_VERTICES * 3);
const searchDirection = [0, 0, 0];
const simplex = new Float64Array(12);
const supportPointA = [0, 0, 0];
const supportPointB = [0, 0, 0];
let faceCount = 0;
let interiorX = 0;
let interiorY = 0;
let interiorZ = 0;
let horizonCount = 0;
let polytopeCount = 0;
let simplexCount = 0;
