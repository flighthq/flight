import type { Entity } from './Entity';
import type { SpatialIndexingExplanation } from './SpatialIndexing';

// 2D broadphase header. `@flighthq/spatial` is the acceleration structure in front of
// `@flighthq/collision`'s narrow-phase: a spatial index over many objects' axis-aligned bounds that
// answers "which pairs are close enough to be worth a narrow-phase test?" and "which objects overlap
// this region / point / ray?" without testing every object against every other. It holds bounds +
// an opaque id per object — never the object's concrete shape, velocity, or display node — so a
// candidate pair it returns is *confirmed* downstream by narrow-phase (or by the caller). The seam
// (SpatialIndexBackend2D) lets the underlying structure swap by workload: a uniform grid is the P1
// default, with quadtree / sort-and-sweep as later drop-in alternates behind the same operations.
//
// THE SEAM CARRIES ITS DIMENSION; THE POLICY VOCABULARY DOES NOT. 3D does not arrive by widening
// these types — `SpatialAabb2D` has no z, and the point and ray queries take no third axis, so this
// seam was never dimension-generic. It arrives instead as the sibling `SpatialIndexBackend3D` over
// `SpatialAabb3D`, reached through `createSpatialIndex3D`, both defined below. Widening one seam to
// three dimensions was rejected because the 2D consumers — `camera`, `interaction`, `physics2d` —
// would pay for an axis they do not use, which is the bundle invariant.
//
// What stays unsuffixed is what is genuinely dimension-free: object identity (`SpatialObjectId`,
// `SpatialPair`), the indexing mode and decline reasons, `bucketCount`, and the cost bounds. So is
// every METHOD NAME on the backend below — a member already sits inside a dimension-suffixed
// interface, and naming it twice adds nothing a reader did not already know from the type it is
// reached through. The FREE functions do carry the suffix, because they take a `SpatialIndex2D` and
// their 3D twins are different functions rather than overloads.
// See `agents/spatial-dimension-seams.md`.

// A handle the caller assigns to each indexed object. A plain `number` (not a string) so ids are
// cache-friendly to key, compare, and dedup; the caller owns the object↔id mapping. The index never
// dereferences an id — it only stores, groups, and returns them.
export type SpatialObjectId = number;

// An object's 2D axis-aligned bounds, as min/max corners. This is spatial's own bounds type: it is
// structurally the same as collision's `CollisionAabb2D`, but defined here so `@flighthq/spatial`
// depends only on `@flighthq/geometry` + `@flighthq/types` and never on `@flighthq/collision`. Also
// distinct from `@flighthq/geometry`'s `Aabb`, whose corners are 3D (min/max carry a `z`).
export interface SpatialAabb2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// An object's 3D axis-aligned bounds, as min/max corners. The sibling of `SpatialAabb2D`, not a
// widening of it: 2D consumers must not carry a z they do not use. Structurally the same as
// `@flighthq/geometry`'s `Aabb`, but defined here for the same reason the 2D one is — `@flighthq/spatial`
// depends only on `@flighthq/geometry` + `@flighthq/types`, and the seam owns its own bounds type.
export interface SpatialAabb3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

// One unordered candidate pair emitted by querySpatialPairs2D. `a` and `b` are distinct ids (never the
// same object) and a given unordered pair is emitted at most once per query. It is a *candidate*:
// the two objects share broadphase locality, which the caller confirms with a narrow-phase test.
//
// Deliberately UNSUFFIXED and shared by both dimensions. A pair carries two ids and no geometry, so
// there is no axis in it to get wrong; suffixing it would double a vocabulary over a distinction that
// does not exist. The dimension boundary is carried by the bounds types and the entry points.
export interface SpatialPair {
  a: SpatialObjectId;
  b: SpatialObjectId;
}

// A view volume for `querySpatialFrustum3D`, as its eight world-space corners in a flat
// `[x0,y0,z0,x1,y1,z1,...]` list — the four NEAR-plane corners first, then the four FAR-plane corners,
// with the two quads in the SAME winding so corner `i` of the near quad pairs with corner `i` of the
// far one.
//
// Corners rather than six planes, for two reasons. A corner list describes a perspective and an
// orthographic volume with one shape and no special case, and — the load-bearing one — the query slices
// the volume along its depth and interpolates near corner to far corner to do it. Six planes carry no
// such correspondence, so recovering it would mean intersecting plane triples to get the corners back.
//
// The pairing is a real precondition rather than a tidiness rule: a near quad wound opposite its far
// quad interpolates into a bow-tie whose bounds are far larger than the volume it should describe, and
// nothing detects it — the query still returns a superset, so it stays correct while going quietly slow.
export interface SpatialFrustum3D {
  corners: number[];
}

// The swappable index seam. A concrete backend (uniform grid in P1; quadtree / sweep-and-prune later)
// stores objects by id + bounds and answers the broadphase queries. All query results are written
// into a caller-provided `out` array — cleared then filled — so a per-frame query loop allocates no
// new structure. `queryPairs` enumerates candidate co-located pairs, deduplicated (each unordered
// pair at most once, never an object with itself). `queryRegion`/`queryPoint`/`queryRay` gather the
// ids whose bounds actually overlap the query — the index confirms each candidate against the real
// bounds, so a conservative structure never leaks a false co-occupant into the result.
export interface SpatialIndexBackend2D {
  // Adds an object with its current bounds. The bounds are copied; the caller may reuse its own.
  // Returns false when the bounds are not indexable at all (non-finite or inverted), in which case
  // the object is not in the index and no query will return it — the expected-failure sentinel, not
  // an error.
  // Oversized-but-valid bounds still return true: a backend may index them by a different route, and
  // the object remains fully queryable.
  insertSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb2D>): boolean;
  // Moves an already-inserted object to new bounds. Inserting a not-yet-present id is equivalent to
  // insert. Returns the same sentinel as insert; a declined update leaves the object out of the index
  // rather than at its previous bounds, so a caller that ignores the sentinel never reads a stale
  // position as a current one.
  updateSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb2D>): boolean;
  // Removes an object. A no-op if the id is not present.
  removeSpatialObject(id: SpatialObjectId): void;
  // Empties the index of all objects, keeping it reusable.
  clearSpatialIndex(): void;
  // Reports how `id` is currently held — the pull query behind explainSpatialIndexing2D. Answering this
  // is part of the seam rather than a grid-only extra because "why is this object not in my query
  // results?" is a question every structure must be able to answer about itself.
  explainSpatialIndexing(id: SpatialObjectId): SpatialIndexingExplanation;
  // Fills `out` with every deduplicated candidate pair (each unordered pair once, never (a,a)).
  querySpatialPairs(out: SpatialPair[]): void;
  // Fills `out` with the ids whose bounds overlap `region`.
  querySpatialRegion(region: Readonly<SpatialAabb2D>, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds contain the point (`x`,`y`).
  querySpatialPoint(x: number, y: number, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds the ray from (`x`,`y`) along (`dx`,`dy`) intersects.
  querySpatialRay(x: number, y: number, dx: number, dy: number, out: SpatialObjectId[]): void;
}

// Opaque per-index runtime: the active backend the public operations dispatch through. Application
// code treats this as internal; it is read and written only by the `@flighthq/spatial` functions.
export interface SpatialIndexRuntime2D {
  backend: SpatialIndexBackend2D;
}

// 2D broadphase index entity. It carries no data of its own — the indexed objects live inside the
// opaque runtime's backend. Create with createSpatialIndex2D (defaulting to a uniform grid), drive it
// with insertSpatialObject2D / updateSpatialObject2D / removeSpatialObject2D, and read it with the query
// functions. The backend swaps the underlying structure without changing this entity's shape.
export interface SpatialIndex2D extends Entity {
  runtime: SpatialIndexRuntime2D;
}

// The 3D swappable index seam — the sibling of `SpatialIndexBackend2D`, carrying the same operations
// over three-dimensional bounds. A uniform grid is the first backend; an octree or a BVH slots in
// behind this seam, which is the one they were always meant to arrive through. Every method matches
// its 2D counterpart's contract exactly, including the `out`-array discipline (cleared then filled, so
// a per-frame query loop allocates no new structure) and the insert/update sentinel.
//
// Method names carry no dimension suffix: a member already sits inside a dimension-suffixed interface,
// so naming it twice tells a reader nothing the type it is reached through did not already say. The
// free functions in `@flighthq/spatial` do carry the suffix, because their 2D twins are different
// functions rather than overloads.
export interface SpatialIndexBackend3D {
  // Adds an object with its current bounds. The bounds are copied; the caller may reuse its own.
  // Returns false when the bounds are not indexable at all (non-finite or inverted), in which case
  // the object is not in the index and no query will return it — the expected-failure sentinel, not
  // an error.
  // Oversized-but-valid bounds still return true: a backend may index them by a different route, and
  // the object remains fully queryable.
  insertSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb3D>): boolean;
  // Moves an already-inserted object to new bounds. Inserting a not-yet-present id is equivalent to
  // insert. Returns the same sentinel as insert; a declined update leaves the object out of the index
  // rather than at its previous bounds, so a caller that ignores the sentinel never reads a stale
  // position as a current one.
  updateSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb3D>): boolean;
  // Removes an object. A no-op if the id is not present.
  removeSpatialObject(id: SpatialObjectId): void;
  // Empties the index of all objects, keeping it reusable.
  clearSpatialIndex(): void;
  // Reports how `id` is currently held — the pull query behind explainSpatialIndexing3D.
  explainSpatialIndexing(id: SpatialObjectId): SpatialIndexingExplanation;
  // Fills `out` with every deduplicated candidate pair (each unordered pair once, never (a,a)).
  querySpatialPairs(out: SpatialPair[]): void;
  // Fills `out` with the ids whose bounds overlap `region`.
  querySpatialRegion(region: Readonly<SpatialAabb3D>, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds contain the point (`x`,`y`,`z`).
  querySpatialPoint(x: number, y: number, z: number, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds the ray from (`x`,`y`,`z`) along (`dx`,`dy`,`dz`) intersects.
  querySpatialRay(x: number, y: number, z: number, dx: number, dy: number, dz: number, out: SpatialObjectId[]): void;
}

// Opaque per-index runtime: the active 3D backend the public operations dispatch through. Application
// code treats this as internal; it is read and written only by the `@flighthq/spatial` functions.
export interface SpatialIndexRuntime3D {
  backend: SpatialIndexBackend3D;
}

// 3D broadphase index entity. It carries no data of its own — the indexed objects live inside the
// opaque runtime's backend. Create with createSpatialIndex3D (defaulting to a uniform grid), drive it
// with insertSpatialObject3D / updateSpatialObject3D / removeSpatialObject3D, and read it with the query
// functions. This is what `@flighthq/physics3d` indexes its colliders in, and what a 3D scene culls
// against.
export interface SpatialIndex3D extends Entity {
  runtime: SpatialIndexRuntime3D;
}
