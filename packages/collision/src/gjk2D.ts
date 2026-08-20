import type { CollisionManifold2D, CollisionShape2D, CollisionSupport2D } from '@flighthq/types/contract';

import { getCollisionSupport2D } from './collisionSupport2D';
import { clearCollisionManifold2D } from './manifold';

// The generic narrow-phase floor: GJK for overlap, EPA for the penetration that follows it.
//
// Both read the two shapes only through their registered support functions, so a kind reaches every
// other registered kind the moment its support exists. This is the O(N) core the pair matrix is O(N²)
// against, and it is a FLOOR rather than a replacement — it yields one normal and one depth, where a
// resting box needs two contact points, which is why the SAT-plus-clipping pairs keep their place
// above it.
//
// The Minkowski difference `A - B` is the object both algorithms actually work on, and neither ever
// builds it: its support in direction `d` is `supportA(d) - supportB(-d)`, one call each. The origin
// lies inside it exactly when the shapes overlap, and the shortest vector from the origin to its
// boundary is the penetration.

// The generic manifold path: GJK for overlap, then EPA for the minimum-translation normal and depth.
// Writes the normal oriented to push **A out of B**, matching every specialized pair.
//
// Returns false — and clears `out` — when either kind has no registered support, when the shapes are
// disjoint, or when EPA cannot find a boundary to measure at all.
//
// ACCURACY, on a curved boundary: the DEPTH converges to the EPA tolerance, but the NORMAL only to
// roughly its square root — around 1e-5 in practice. That is geometry rather than a defect. EPA
// terminates on a distance, and distance is second-order insensitive to angular error: tilting the
// normal by theta on a circle of radius r changes the distance by only `r * theta^2 / 2`, so driving
// the distance to 1e-10 still leaves the direction 1e-5 out. Chasing it would mean a tolerance at
// double-precision noise. On a polytope there is no curve and the answer is exact.
//
// This is one of the two things that make a pair specialization worth registering — the other being
// speed — and circle pairs have an exact closed form, so the built-in specializations are what a
// caller actually gets.
export function testCollisionSupport2D(
  a: Readonly<CollisionShape2D>,
  b: Readonly<CollisionShape2D>,
  out: CollisionManifold2D,
): boolean {
  clearCollisionManifold2D(out);
  const supportA = getCollisionSupport2D(a.kind);
  const supportB = getCollisionSupport2D(b.kind);
  if (supportA === null || supportB === null) return false;
  if (runGjk2D(a, supportA, b, supportB) !== GJK_OVERLAPPING) return false;
  return writeEpa2DPenetration(a, supportA, b, supportB, out);
}

// Whether two shapes overlap, by GJK. Returns false when either kind has no registered support — an
// unregistered kind cannot be tested, and reporting "not overlapping" is the package's standing
// sentinel for that, which `explainCollisionTest2D` classifies and the guard warns about.
//
// Touching counts as NOT overlapping, matching every other test in the package: the search stops as
// soon as a support point fails to reach past the origin, and a point exactly on it fails that test.
export function testCollisionSupportOverlap2D(a: Readonly<CollisionShape2D>, b: Readonly<CollisionShape2D>): boolean {
  const supportA = getCollisionSupport2D(a.kind);
  const supportB = getCollisionSupport2D(b.kind);
  if (supportA === null || supportB === null) return false;
  return runGjk2D(a, supportA, b, supportB) === GJK_OVERLAPPING;
}

// Expands the terminating GJK simplex out to the Minkowski boundary, finding the closest edge to the
// origin. That edge's outward normal and distance ARE the minimum translation.
//
// The sign is the part worth stating. The closest boundary point sits at `normal * distance` from the
// origin, and translating A by the NEGATIVE of that vector moves the origin onto the boundary — which
// is the definition of just separating. So the manifold normal, which must push A out of B, is the
// negated EPA normal.
function writeEpa2DPenetration(
  a: Readonly<CollisionShape2D>,
  supportA: CollisionSupport2D,
  b: Readonly<CollisionShape2D>,
  supportB: CollisionSupport2D,
  out: CollisionManifold2D,
): boolean {
  let count = 3;
  for (let i = 0; i < 6; i += 1) polytope[i] = simplex[i];

  // Hoisted out of the loop so running out of iterations returns the BEST EDGE FOUND rather than
  // nothing. GJK has already decided these shapes overlap; an EPA that gives up would make the two
  // entry points contradict each other about that, which is worse than a normal converged one
  // iteration short. Only a polytope with no measurable edge at all is a real failure.
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let found = false;

  for (let iteration = 0; iteration < MAX_EPA_ITERATIONS; iteration += 1) {
    // The closest edge of the current polytope, and its outward normal. Outward is decided per edge by
    // the sign of its own distance rather than against an interior point: the polytope contains the
    // origin, so flipping any perpendicular that points inward is enough.
    let bestEdge = -1;
    bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      const ax = polytope[i * 2];
      const ay = polytope[i * 2 + 1];
      const edgeX = polytope[j * 2] - ax;
      const edgeY = polytope[j * 2 + 1] - ay;
      let normalX = edgeY;
      let normalY = -edgeX;
      const length = Math.sqrt(normalX * normalX + normalY * normalY);
      if (length <= EPSILON) continue;
      normalX /= length;
      normalY /= length;
      let distance = ax * normalX + ay * normalY;
      if (distance < 0) {
        normalX = -normalX;
        normalY = -normalY;
        distance = -distance;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        bestNormalX = normalX;
        bestNormalY = normalY;
        bestEdge = j;
        found = true;
      }
    }
    if (bestEdge < 0) break;

    writeMinkowskiSupport2D(a, supportA, b, supportB, bestNormalX, bestNormalY, minkowski);
    const reach = minkowski[0] * bestNormalX + minkowski[1] * bestNormalY;
    // Converged: the boundary in this direction is where the polytope already says it is, so no new
    // vertex can push the edge further out.
    if (reach - bestDistance <= EPA_TOLERANCE || count + 1 >= MAX_POLYTOPE_VERTICES) break;

    // Insert the new vertex on the closest edge, splitting it in two.
    for (let i = count; i > bestEdge; i -= 1) {
      polytope[i * 2] = polytope[(i - 1) * 2];
      polytope[i * 2 + 1] = polytope[(i - 1) * 2 + 1];
    }
    polytope[bestEdge * 2] = minkowski[0];
    polytope[bestEdge * 2 + 1] = minkowski[1];
    count += 1;
  }

  if (!found) return false;
  // Reported as overlapping even at a vanishing depth, because GJK already decided that and the two
  // entry points must not disagree. A grazing pair puts the origin almost exactly on the Minkowski
  // boundary; the direction there is still defined by the closest edge, and the depth is honestly near
  // zero rather than absent.
  out.overlapping = true;
  out.normalX = -bestNormalX;
  out.normalY = -bestNormalY;
  out.depth = bestDistance;
  return true;
}

// Runs GJK until it encloses the origin or proves it cannot, leaving the final simplex in `simplex`.
// Returns `GJK_OVERLAPPING` or `GJK_SEPARATED`.
//
// The search direction starts from the vector between the two shapes' first support points rather than
// from a fixed axis, so a pair that is already far apart on one axis is rejected in the first
// iteration instead of walking there.
function runGjk2D(
  a: Readonly<CollisionShape2D>,
  supportA: CollisionSupport2D,
  b: Readonly<CollisionShape2D>,
  supportB: CollisionSupport2D,
): number {
  writeMinkowskiSupport2D(a, supportA, b, supportB, 1, 0, minkowski);
  simplex[0] = minkowski[0];
  simplex[1] = minkowski[1];
  let count = 1;
  let directionX = -simplex[0];
  let directionY = -simplex[1];

  for (let iteration = 0; iteration < MAX_GJK_ITERATIONS; iteration += 1) {
    if (directionX === 0 && directionY === 0) {
      // The origin is ON the simplex. Touching, not overlapping — the same answer every other test in
      // the package gives for a pair that merely grazes.
      return GJK_SEPARATED;
    }
    writeMinkowskiSupport2D(a, supportA, b, supportB, directionX, directionY, minkowski);
    if (minkowski[0] * directionX + minkowski[1] * directionY <= 0) return GJK_SEPARATED;

    simplex[count * 2] = minkowski[0];
    simplex[count * 2 + 1] = minkowski[1];
    count += 1;

    if (count === 2) {
      // Line case: the origin lies off one side of the segment, and the next direction is the
      // perpendicular pointing at it.
      const bx = simplex[0];
      const by = simplex[1];
      const ax = simplex[2];
      const ay = simplex[3];
      const edgeX = bx - ax;
      const edgeY = by - ay;
      // The triple product `(edge x -a) x edge`, which is the component of `-a` perpendicular to the
      // edge — the direction the origin actually lies in, rather than either bare perpendicular.
      const cross = edgeX * -ay - edgeY * -ax;
      if (cross === 0) {
        // The origin is COLLINEAR with the segment, and that proves nothing on its own: a 1-simplex
        // touching the origin is still only a line through a 2D shape, and the origin can sit well
        // inside it. Taking this for separation is the bug that reports two overlapping circles whose
        // centres share an axis as disjoint — the most ordinary configuration there is. Either
        // perpendicular carries the search on; the triangle case is what decides containment.
        directionX = -edgeY;
        directionY = edgeX;
      } else {
        directionX = -edgeY * cross;
        directionY = edgeX * cross;
      }
      continue;
    }

    // Triangle case: the origin is either outside one of the two new edges, or enclosed.
    const cx = simplex[0];
    const cy = simplex[1];
    const bx = simplex[2];
    const by = simplex[3];
    const ax = simplex[4];
    const ay = simplex[5];

    const abX = bx - ax;
    const abY = by - ay;
    const acX = cx - ax;
    const acY = cy - ay;

    // The outward perpendicular of each edge, as the triple product `(ac x ab) x ab` expanded to
    // `ab(ac.ab) - ac(ab.ab)`. Winding-INDEPENDENT, which matters: taking the bare perpendicular and
    // orienting it by the triangle's signed area gets the sign right for one winding and inverts it for
    // the other, so half of all inputs report the origin outside an edge it is inside. The support
    // points arrive in whatever order the search produced, so neither winding can be assumed.
    const abDotAc = abX * acX + abY * acY;
    const abLengthSquared = abX * abX + abY * abY;
    const acLengthSquared = acX * acX + acY * acY;

    const abNormalX = abX * abDotAc - acX * abLengthSquared;
    const abNormalY = abY * abDotAc - acY * abLengthSquared;
    if (abNormalX * -ax + abNormalY * -ay > 0) {
      // Drop C: the origin is beyond AB.
      simplex[0] = bx;
      simplex[1] = by;
      simplex[2] = ax;
      simplex[3] = ay;
      count = 2;
      directionX = abNormalX;
      directionY = abNormalY;
      continue;
    }

    const acNormalX = acX * abDotAc - abX * acLengthSquared;
    const acNormalY = acY * abDotAc - abY * acLengthSquared;
    if (acNormalX * -ax + acNormalY * -ay > 0) {
      // Drop B: the origin is beyond AC.
      simplex[2] = ax;
      simplex[3] = ay;
      count = 2;
      directionX = acNormalX;
      directionY = acNormalY;
      continue;
    }

    return GJK_OVERLAPPING;
  }
  return GJK_SEPARATED;
}

// Writes the support point of the Minkowski difference `A - B` along a direction: the furthest point
// on A one way, minus the furthest point on B the other. The difference is never materialized.
function writeMinkowskiSupport2D(
  a: Readonly<CollisionShape2D>,
  supportA: CollisionSupport2D,
  b: Readonly<CollisionShape2D>,
  supportB: CollisionSupport2D,
  directionX: number,
  directionY: number,
  out: number[],
): void {
  supportA(a, directionX, directionY, supportPointA);
  supportB(b, -directionX, -directionY, supportPointB);
  out[0] = supportPointA[0] - supportPointB[0];
  out[1] = supportPointA[1] - supportPointB[1];
}

const GJK_OVERLAPPING = 1;
const GJK_SEPARATED = 0;
// GJK converges in a handful of iterations for convex shapes; the cap is a guard against a support
// function that is not convex rather than a tuning knob. A non-convex polygon can cycle forever, and
// this package already refuses those through `getCollisionPolygonValidationStatus2D`.
const MAX_GJK_ITERATIONS = 32;
const MAX_EPA_ITERATIONS = 32;
// The polytope only ever grows by one vertex per iteration, so this bounds the scratch rather than the
// answer's quality: hitting it returns the best edge found so far, which is already within tolerance
// for every shape a caller can build out of the four registered kinds.
const MAX_POLYTOPE_VERTICES = 40;
const EPA_TOLERANCE = 1e-9;
const EPSILON = 1e-12;

const minkowski = [0, 0];
const polytope = new Float64Array(MAX_POLYTOPE_VERTICES * 2 + 2);
const simplex = [0, 0, 0, 0, 0, 0];
const supportPointA = [0, 0];
const supportPointB = [0, 0];
