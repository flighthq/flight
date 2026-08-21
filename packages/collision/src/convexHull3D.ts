// The convex hull of a 3D point set, as a triangulated surface.
//
// THIS IS THE MISSING PRIMITIVE BEHIND THREE SEPARATE GAPS, which is why it earns its own file rather
// than living inside whichever consumer needed it first. `CollisionConvex3D` is a bare `[x,y,z,...]`
// list with no topology, and a support function — the thing the narrow phase reaches a hull through —
// hides topology by construction. So a hull could be collided but not weighed (its inertia is a volume
// integral over a triangulation), not raycast from outside (a ray meets FACES), and not drawn as a
// wireframe (an edge set). One triangulation answers all three.
//
// Incremental construction: start from a non-degenerate tetrahedron, then add each remaining point by
// deleting every face it can see and stitching the resulting hole shut against it. Built from the
// published description of that algorithm, in this package's own out-parameter style.

// Writes the hull's triangles into `out` as flat `[i0,i1,i2,...]` INDICES into `points`, and returns the
// triangle count. Returns 0 when the input has fewer than four points or is degenerate — all collinear
// or all coplanar — which are the cases with no enclosed volume to triangulate.
//
// Every triangle is wound so its normal points OUT of the hull, which each consumer depends on: a
// signed-volume sum needs consistent orientation to avoid cancelling itself, and a raycast needs to know
// which side it approached from.
export function writeCollisionConvexHullFaces3D(points: readonly number[], out: number[]): number {
  out.length = 0;
  const count = Math.floor(points.length / 3);
  if (count < 4) return 0;

  const seed = findInitialTetrahedron(points, count);
  if (seed === null) return 0;

  // Faces are held as a flat index triple list plus a parallel "alive" flag, rather than as objects, so
  // the build allocates two arrays regardless of hull size.
  const faces: number[] = [];
  const alive: boolean[] = [];
  const [a, b, c, d] = seed;
  addTetrahedronFaces(points, a, b, c, d, faces, alive);

  const horizon: number[] = [];
  for (let p = 0; p < count; p += 1) {
    if (p === a || p === b || p === c || p === d) continue;
    addPointToHull(points, p, faces, alive, horizon);
  }

  for (let f = 0; f < alive.length; f += 1) {
    if (!alive[f]) continue;
    out.push(faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2]);
  }
  return out.length / 3;
}

// Deletes every face `p` can see and stitches the hole shut against it.
//
// The HORIZON is the boundary of the deleted region: an edge belonging to exactly one visible face. An
// edge shared by two visible faces is interior to the hole and must not be stitched, and the two visible
// faces walk it in OPPOSITE directions — which is what makes "appears once" the right test and why the
// winding must be preserved rather than normalised when collecting.
function addPointToHull(
  points: readonly number[],
  p: number,
  faces: number[],
  alive: boolean[],
  horizon: number[],
): void {
  // The edges are collected in the SAME pass that deletes, which is what keeps "deleted this round"
  // from needing to be recorded anywhere. A face deleted on an earlier point is already stitched over,
  // so revisiting it would contribute edges to a hole that no longer exists.
  horizon.length = 0;
  const faceCount = alive.length;
  let anyVisible = false;
  for (let f = 0; f < faceCount; f += 1) {
    if (!alive[f]) continue;
    if (!isFaceVisibleFrom(points, faces, f, p)) continue;
    alive[f] = false;
    anyVisible = true;
    const i0 = faces[f * 3];
    const i1 = faces[f * 3 + 1];
    const i2 = faces[f * 3 + 2];
    pushHorizonEdge(horizon, i0, i1);
    pushHorizonEdge(horizon, i1, i2);
    pushHorizonEdge(horizon, i2, i0);
  }
  // Inside the hull already, or only grazing it: nothing to delete and nothing to add.
  if (!anyVisible) return;

  // Each surviving directed edge (u, v) becomes the triangle (u, v, p). Reusing the edge's own direction
  // is what carries the deleted face's outward orientation onto its replacement — reversing it here
  // builds a hull that is inside out, which no later step can detect.
  for (let e = 0; e < horizon.length; e += 2) {
    faces.push(horizon[e], horizon[e + 1], p);
    alive.push(true);
  }
}

// Adds a directed edge unless its REVERSE is already present, in which case both are interior and the
// reverse is removed.
function pushHorizonEdge(horizon: number[], u: number, v: number): void {
  for (let e = 0; e < horizon.length; e += 2) {
    if (horizon[e] === v && horizon[e + 1] === u) {
      horizon[e] = horizon[horizon.length - 2];
      horizon[e + 1] = horizon[horizon.length - 1];
      horizon.length -= 2;
      return;
    }
  }
  horizon.push(u, v);
}

function addTetrahedronFaces(
  points: readonly number[],
  a: number,
  b: number,
  c: number,
  d: number,
  faces: number[],
  alive: boolean[],
): void {
  // Each face is oriented away from the opposite vertex, which is interior to the tetrahedron by
  // construction and therefore an unambiguous inside reference.
  for (const [i0, i1, i2, opposite] of [
    [a, b, c, d],
    [a, c, d, b],
    [a, d, b, c],
    [b, d, c, a],
  ]) {
    if (isPointAbovePlane(points, i0, i1, i2, opposite) > 0) faces.push(i0, i2, i1);
    else faces.push(i0, i1, i2);
    alive.push(true);
  }
}

// A tetrahedron of four points with real volume: the two furthest apart, the point furthest from the
// line they span, and the point furthest from the plane those three span. Returns null when the set is
// collinear or coplanar and encloses nothing.
function findInitialTetrahedron(points: readonly number[], count: number): [number, number, number, number] | null {
  let a = 0;
  let b = 0;
  let best = 0;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const distance = squaredDistance(points, i, j);
      if (distance > best) {
        best = distance;
        a = i;
        b = j;
      }
    }
  }
  if (best <= 0) return null;

  let c = -1;
  best = 0;
  for (let i = 0; i < count; i += 1) {
    if (i === a || i === b) continue;
    const area = squaredTriangleArea(points, a, b, i);
    if (area > best) {
      best = area;
      c = i;
    }
  }
  if (c < 0 || best <= 0) return null;

  let d = -1;
  best = 0;
  for (let i = 0; i < count; i += 1) {
    if (i === a || i === b || i === c) continue;
    const volume = Math.abs(isPointAbovePlane(points, a, b, c, i));
    if (volume > best) {
      best = volume;
      d = i;
    }
  }
  if (d < 0 || best <= HULL_EPSILON) return null;

  return [a, b, c, d];
}

// The signed volume of the parallelepiped on (i1-i0, i2-i0, p-i0). Positive when `p` is on the side the
// face's winding normal points toward. Unnormalised on purpose: normalising costs a square root per test
// and changes no sign.
function isPointAbovePlane(points: readonly number[], i0: number, i1: number, i2: number, p: number): number {
  const ax = points[i0 * 3];
  const ay = points[i0 * 3 + 1];
  const az = points[i0 * 3 + 2];
  const e1x = points[i1 * 3] - ax;
  const e1y = points[i1 * 3 + 1] - ay;
  const e1z = points[i1 * 3 + 2] - az;
  const e2x = points[i2 * 3] - ax;
  const e2y = points[i2 * 3 + 1] - ay;
  const e2z = points[i2 * 3 + 2] - az;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return nx * (points[p * 3] - ax) + ny * (points[p * 3 + 1] - ay) + nz * (points[p * 3 + 2] - az);
}

function isFaceVisibleFrom(points: readonly number[], faces: readonly number[], f: number, p: number): boolean {
  return isPointAbovePlane(points, faces[f * 3], faces[f * 3 + 1], faces[f * 3 + 2], p) > HULL_EPSILON;
}

function squaredDistance(points: readonly number[], i: number, j: number): number {
  const dx = points[j * 3] - points[i * 3];
  const dy = points[j * 3 + 1] - points[i * 3 + 1];
  const dz = points[j * 3 + 2] - points[i * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

function squaredTriangleArea(points: readonly number[], i0: number, i1: number, i2: number): number {
  const e1x = points[i1 * 3] - points[i0 * 3];
  const e1y = points[i1 * 3 + 1] - points[i0 * 3 + 1];
  const e1z = points[i1 * 3 + 2] - points[i0 * 3 + 2];
  const e2x = points[i2 * 3] - points[i0 * 3];
  const e2y = points[i2 * 3 + 1] - points[i0 * 3 + 1];
  const e2z = points[i2 * 3 + 2] - points[i0 * 3 + 2];
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return nx * nx + ny * ny + nz * nz;
}

// Absolute, and deliberately loose relative to the coordinates a collider uses: a point within this of a
// face's plane is treated as ON it and does not delete the face. Too tight and near-coplanar input
// produces a hull with slivers; too loose and genuine detail is swallowed.
const HULL_EPSILON = 1e-10;
