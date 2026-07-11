// 2D broadphase header. `@flighthq/spatial` is the acceleration structure in front of
// `@flighthq/collision`'s narrow-phase: a spatial index over many objects' axis-aligned bounds that
// answers "which pairs are close enough to be worth a narrow-phase test?" and "which objects overlap
// this region / point / ray?" without testing every object against every other. It holds bounds +
// an opaque id per object — never the object's concrete shape, velocity, or display node — so a
// candidate pair it returns is *confirmed* downstream by narrow-phase (or by the caller). The seam
// (SpatialIndexBackend) lets the underlying structure swap by workload: a uniform grid is the P1
// default, with quadtree / sort-and-sweep as later drop-in alternates behind the same operations.

// A handle the caller assigns to each indexed object. A plain `number` (not a string) so ids are
// cache-friendly to key, compare, and dedup; the caller owns the object↔id mapping. The index never
// dereferences an id — it only stores, groups, and returns them.
export type SpatialObjectId = number;

// An object's 2D axis-aligned bounds, as min/max corners. This is spatial's own bounds type: it is
// structurally the same as collision's `CollisionAabb`, but defined here so `@flighthq/spatial`
// depends only on `@flighthq/geometry` + `@flighthq/types` and never on `@flighthq/collision`. Also
// distinct from `@flighthq/geometry`'s `Aabb`, whose corners are 3D (min/max carry a `z`).
export interface SpatialAabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// One unordered candidate pair emitted by querySpatialPairs. `a` and `b` are distinct ids (never the
// same object) and a given unordered pair is emitted at most once per query. It is a *candidate*:
// the two objects share broadphase locality, which the caller confirms with a narrow-phase test.
export interface SpatialPair {
  a: SpatialObjectId;
  b: SpatialObjectId;
}

// The swappable index seam. A concrete backend (uniform grid in P1; quadtree / sweep-and-prune later)
// stores objects by id + bounds and answers the broadphase queries. All query results are written
// into a caller-provided `out` array — cleared then filled — so a per-frame query loop allocates no
// new structure. `queryPairs` enumerates candidate co-located pairs, deduplicated (each unordered
// pair at most once, never an object with itself). `queryRegion`/`queryPoint`/`queryRay` gather the
// ids whose bounds actually overlap the query — the index confirms each candidate against the real
// bounds, so a conservative structure never leaks a false co-occupant into the result.
export interface SpatialIndexBackend {
  // Adds an object with its current bounds. The bounds are copied; the caller may reuse its own.
  insertSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb>): void;
  // Moves an already-inserted object to new bounds. Inserting a not-yet-present id is equivalent to
  // insert.
  updateSpatialObject(id: SpatialObjectId, bounds: Readonly<SpatialAabb>): void;
  // Removes an object. A no-op if the id is not present.
  removeSpatialObject(id: SpatialObjectId): void;
  // Empties the index of all objects, keeping it reusable.
  clearSpatialIndex(): void;
  // Fills `out` with every deduplicated candidate pair (each unordered pair once, never (a,a)).
  querySpatialPairs(out: SpatialPair[]): void;
  // Fills `out` with the ids whose bounds overlap `region`.
  querySpatialRegion(region: Readonly<SpatialAabb>, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds contain the point (`x`,`y`).
  querySpatialPoint(x: number, y: number, out: SpatialObjectId[]): void;
  // Fills `out` with the ids whose bounds the ray from (`x`,`y`) along (`dx`,`dy`) intersects.
  querySpatialRay(x: number, y: number, dx: number, dy: number, out: SpatialObjectId[]): void;
}

// Opaque per-index runtime: the active backend the public operations dispatch through. Application
// code treats this as internal; it is read and written only by the `@flighthq/spatial` functions.
export interface SpatialIndexRuntime {
  backend: SpatialIndexBackend;
}

// 2D broadphase index entity. It carries no data of its own — the indexed objects live inside the
// opaque runtime's backend. Create with createSpatialIndex (defaulting to a uniform grid), drive it
// with insertSpatialObject / updateSpatialObject / removeSpatialObject, and read it with the query
// functions. The backend swaps the underlying structure without changing this entity's shape.
export interface SpatialIndex {
  runtime: SpatialIndexRuntime;
}
