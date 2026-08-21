// Narrow-phase collision header. `@flighthq/collision` tests one collider pair for overlap and, when
// they overlap, writes a manifold — the minimum-translation vector that separates the pair. It also
// computes exact first contact under linear translation for continuous collision users. Shapes are
// plain data (kind + parameters), decoupled from the scene graph; a game maps its entities onto these.
// This is the detection layer a physics step or trigger system queries after a broadphase has narrowed
// the candidate pairs; it does not resolve penetration or integrate motion.
// Distinct from @flighthq/geometry (whose Aabb/Obb/sphere are 3D) and @flighthq/interaction (pointer
// hit-testing against display objects): these are general collider-vs-collider colliders.
//
// EVERY TYPE HERE CARRIES ITS DIMENSION, and that suffix is the package's only defence against mixing
// dimensions. In the scene graph a `*Kind` does two jobs — registry key and hierarchy-family
// enforcement, so a `Node3D` cannot enter a `Scene2D`. Collision has no hierarchy to lean on: its
// colliders are plain data with no scene, no display, and no renderer, so the kind string does the
// first job only. The dimension therefore lives in the STATIC SHAPE TYPE and the ENTRY POINT — never
// in the kind string, and never in a runtime `dimension` field. Passing a sphere to `testCollision2D`
// is a compile error because the two shape unions never unify.
//
// The 3D half is the sibling set below: the same types with a `3D` suffix, reached through
// `testCollision3D`, sharing nothing with these but the design. See
// `agents/collision-support-registry.md`.

// The identifier for a 2D collider shape. Open union: the six built-in kinds plus any string, so a
// vendor can add a custom collider kind (namespaced, e.g. `'acme.capsule'`). The `(string & {})` arm
// keeps autocomplete for the built-ins while still accepting any string.
//
// Kept separate from a future `CollisionShapeKind3D` even though both are `string` underneath. The two
// name disjoint sets — `'circle'` is not a 3D kind and `'sphere'` is not a 2D one — and the support
// registries they key are separate for the same reason: a 2D support function takes a 2-vector
// direction and a 3D one takes a 3-vector, so they could not share a registry even by accident.
export type CollisionShapeKind2D = 'circle' | 'aabb' | 'obb' | 'polygon' | 'segment' | 'point' | (string & {});

// A circle collider: center (`x`,`y`) and `radius`.
export interface CollisionCircle2D {
  x: number;
  y: number;
  radius: number;
}

// An axis-aligned bounding box collider, stored as its min/max corners. This is the 2D collision
// AABB — distinct from @flighthq/geometry's 3D `Aabb`.
export interface CollisionAabb2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// An oriented bounding box collider: center (`x`,`y`), half-extents (`halfW`,`halfH`) along the box's
// own local axes, and `rotation` in radians (counter-clockwise, applied about the center).
export interface CollisionObb2D {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  rotation: number;
}

// A convex polygon collider. `points` is a flat `[x0,y0,x1,y1,...]` list of at least three vertices.
// The polygon is assumed **convex** and simple; concave input produces undefined manifolds. Winding
// (CW or CCW) does not matter — the tests are winding-agnostic and orient the manifold by centroid.
export interface CollisionPolygon2D {
  points: readonly number[];
}

// A line-segment collider from (`x0`,`y0`) to (`x1`,`y1`). Segments are area-less: they answer
// boolean overlap queries (`testSegment*Collision`), not manifolds.
export interface CollisionSegment2D {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// A single point collider at (`x`,`y`). Area-less: it answers containment queries, not manifolds.
export interface CollisionPoint2D {
  x: number;
  y: number;
}

// The closed union over the six built-in colliders, discriminated by `kind`. This is what the queries
// with NO registry behind them take — containment, raycast, sweep, contact clipping — because a vendor
// kind has nothing to answer them with, and a compile error says so better than a silent `false`.
export type CollisionBuiltInShape2D =
  | (CollisionCircle2D & { kind: 'circle' })
  | (CollisionAabb2D & { kind: 'aabb' })
  | (CollisionObb2D & { kind: 'obb' })
  | (CollisionPolygon2D & { kind: 'polygon' })
  | (CollisionSegment2D & { kind: 'segment' })
  | (CollisionPoint2D & { kind: 'point' });

// A collider of a kind this package does not define, reached entirely through the registries. Its
// parameters are deliberately absent: only the support function registered for that kind knows how to
// read them, and it is the one that casts.
//
// THE VENDOR PREFIX IS THE TYPE, not merely a convention. `'acme.capsule'` is admitted because it has
// a dot; `'capsule'` is not. That one rule is what lets this arm be open without dissolving the two
// boundaries the package depends on:
//   - Narrowing survives. No built-in kind contains a dot, so `case 'circle':` cannot also select this
//     arm, and the exhaustive switches keep working with no cast.
//   - THE DIMENSION BOUNDARY SURVIVES. This is the load-bearing one. An arm typed `{ kind: string }`
//     would make every 3D collider assignable to `testCollision2D`, silently — `'sphere'` is a string.
//     Requiring the dot keeps the built-in 2D and 3D kind sets disjoint literals, so passing a sphere
//     to a 2D entry point stays the compile error `agents/collision-support-registry.md` promises.
// The registration functions still take the wider `CollisionShapeKind2D`: registration is a runtime map
// and stays permissive, so the prefix is enforced where it buys type safety and nowhere else.
export interface CollisionVendorShape2D {
  kind: CollisionVendorKind2D;
}

// A vendor-namespaced collider kind: any string containing a dot.
export type CollisionVendorKind2D = `${string}.${string}`;

// Every 2D collider, built-in or vendor. The generic `testCollision2D` and both registries take this;
// the direct per-pair tests (`testCircleCircleCollision2D`, ...) take the bare untagged parameter types
// and are the hot path.
export type CollisionShape2D = CollisionBuiltInShape2D | CollisionVendorShape2D;

// The result of a narrow-phase test, written into an `out` parameter so a hot loop over thousands of
// pairs allocates nothing. When `overlapping` is true, (`normalX`,`normalY`) is the unit
// minimum-translation axis oriented to push shape **A out of B**, and `depth` is the penetration
// distance along it — moving A by `normal * depth` just separates the pair. When `overlapping` is
// false the pair is disjoint (or merely touching, which is treated as non-overlapping) and
// `normalX`/`normalY`/`depth` are left at 0.
export interface CollisionManifold2D {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  depth: number;
}

// Exact first intersection of a parametric ray `origin + direction * fraction` with one shape.
// `raycastCollisionShape2D` rewrites this record and returns whether it is live. A zero normal means the
// origin was already inside the shape or the hit shape is area-less and has no outward-facing side.
export interface CollisionRaycastHit2D {
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

// Exact first contact for two convex area shapes translated linearly over one normalized interval.
// `fraction` lies in [0,maxFraction]; the normal points in the direction that separates A out of B,
// matching every discrete manifold, and (`x`,`y`) is a support point on A at impact. Rotational sweep
// is deliberately outside this primitive: callers must subdivide changing orientations explicitly.
export interface CollisionTimeOfImpact2D {
  fraction: number;
  x: number;
  y: number;
  normalX: number;
  normalY: number;
}

// Plain-data answer to "why did testCollision2D return false?". `shapeIndex` identifies invalid or
// unsupported input (0 for A, 1 for B); it is null for an ordinary separated pair or an overlap.
export interface CollisionTestExplanation2D {
  readonly kind: CollisionShapeKind2D | null;
  readonly overlapping: boolean;
  readonly shapeIndex: 0 | 1 | null;
  readonly status: CollisionTestStatus;
}

// The result classification shared by explainCollisionTest2D and the opt-in guard seam.
export type CollisionTestStatus =
  | 'degenerate-shape'
  | 'non-convex-polygon'
  | 'overlapping'
  | 'separated'
  | 'unsupported-shape-kind';

// Writes the furthest point on `shape` along the direction (`dirX`,`dirY`) into `out` as `[x, y]`.
//
// The missing primitive the whole narrow phase is built on. A pair matrix costs one authored function
// per ORDERED PAIR of kinds — ten today for circle/aabb/obb/polygon, twenty-one for the chartered 3D
// set — while a support function costs one per KIND, and GJK reaches overlap and penetration through
// nothing else. Registering one makes a shape work against every other registered shape immediately.
//
// The direction is NOT required to be unit length, and a zero direction is a legal degenerate input a
// support function must answer with some point on the shape rather than a NaN.
//
// A 3D support function is `(shape, dirX, dirY, dirZ, out)` — a different arity, in a different
// registry. The two could not be confused even by accident, which is the dimension boundary holding
// without anything having to enforce it.
export type CollisionSupport2D = (shape: Readonly<CollisionShape2D>, dirX: number, dirY: number, out: number[]) => void;

// A narrow-phase test specialized to one ordered pair of kinds, registered over the generic
// support-function floor where it earns its place.
//
// Two things earn it. Speed: circle-circle is three operations and would be an iterative solve through
// GJK. And CONTACT QUALITY: the SAT pairs hand back the reference face that manifold clipping needs
// anyway, which a support function structurally hides — GJK yields one deepest point where a resting
// box needs two. The generic core is the floor, never the ceiling.
export type CollisionPairTest2D = (
  a: Readonly<CollisionShape2D>,
  b: Readonly<CollisionShape2D>,
  out: CollisionManifold2D,
) => boolean;

// Installed by enableCollisionGuards and consulted only by the generic testCollision2D dispatcher.
// Direct typed pair functions remain the allocation-free hot path.
export type CollisionTestGuard2D = (a: Readonly<CollisionShape2D>, b: Readonly<CollisionShape2D>) => void;

// One point of contact between two overlapping shapes. (`x`,`y`) is the world-space anchor and
// `depth` is that point's own penetration along the manifold normal — points on the same manifold
// generally penetrate by different amounts, which is what lets a solver correct a tilted resting
// contact. `featureId` is an opaque integer naming which pair of shape features (edges/vertices)
// produced the point: it is stable frame to frame while the same features stay in contact, so a
// physics solver can match this frame's point against last frame's cached impulse and warm-start it.
// Treat the value as an identity token only — nothing is encoded for callers to read.
export interface CollisionContactPoint2D {
  x: number;
  y: number;
  depth: number;
  featureId: number;
}

// The full contact manifold: everything `CollisionManifold2D` reports plus the world-space points at
// which the two shapes actually touch. A minimum-translation normal alone is enough to *separate* a
// pair, but not to simulate one — a rigid-body impulse acts at a point, and its angular term is the
// cross product of the lever arm (contact point minus center of mass) with the normal. With no
// point there is no lever arm, so contact can never produce torque: a box would slide down a slope
// without ever tipping. `@flighthq/physics2d` consumes this; a trigger system or overlap query
// wants the cheaper `CollisionManifold2D` and the `test*Collision` functions instead.
//
// `overlapping`, `normalX`, `normalY`, and `depth` carry exactly the `CollisionManifold2D` meaning —
// normal oriented to push **A out of B**, `depth` the minimum-translation penetration along it.
// `points` is a fixed two-element array owned by the manifold and reused across calls (2 is the
// maximum for 2D convex contact: a face-face pair). `pointCount` says how many leading entries are
// valid this call — 2 for a face-face contact, 1 for a vertex-face or circle contact, and 0 when
// the pair overlaps but the contact region degenerates, in which case a solver can still fall back
// to the normal and `depth`. Entries beyond `pointCount` hold stale values and must not be read.
//
// Points lie on the surface of the penetrating (incident) shape: the clipped incident face for
// polygon pairs, the circle's deepest surface point for circle pairs. The two surfaces differ by at
// most `depth`, which is immaterial to a solver that uses the point only as a lever-arm anchor.
export interface CollisionContactManifold2D {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  depth: number;
  pointCount: number;
  points: CollisionContactPoint2D[];
}

// The identifier for a 3D collider shape. Open union with the same shape as its 2D twin: five built-in
// kinds plus any string, so a vendor can add a namespaced collider kind (e.g. `'acme.cone'`).
//
// The built-in names are deliberately disjoint from the 2D set — `'sphere'` is not a 2D kind and
// `'circle'` is not a 3D one — so the two literal unions never unify and the dimension boundary holds
// at compile time. `'aabb'` is the one name both dimensions use, which is exactly why the SHAPE types
// rather than the kind strings carry the boundary: `CollisionAabb2D` has no z, so a 3D AABB cannot be
// passed to a 2D entry point even though the two kinds share a spelling.
//
// TRIANGLE MESH AND HEIGHTFIELD ARE ABSENT, and not by omission. Every kind here is CONVEX, because a
// support function answers "furthest point in a direction" and that only determines a shape when the
// shape is convex — GJK against a concave hull silently reports the hull's answer, not the shape's. A
// mesh enters through decomposition instead: the caller (or a future mesh layer) tests the convex
// pieces or the individual triangles it overlaps, each of which IS a shape here. Registering a mesh
// support function would be the one way to make this core quietly wrong.
export type CollisionShapeKind3D =
  | 'sphere'
  | 'aabb'
  | 'box'
  | 'capsule'
  | 'cylinder'
  | 'cone'
  | 'convex'
  | (string & {});

// A sphere collider: centre (`x`,`y`,`z`) and `radius`.
export interface CollisionSphere3D {
  x: number;
  y: number;
  z: number;
  radius: number;
}

// An axis-aligned box collider, as min/max corners. Distinct from `@flighthq/geometry`'s `Aabb` and
// from `SpatialAabb3D`: those are bounds, this is a collider, and the three are kept apart so the
// packages do not depend on each other.
export interface CollisionAabb3D {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

// An oriented box collider: centre (`x`,`y`,`z`), half extents along its own axes, and a rotation.
//
// The rotation is a QUATERNION rather than Euler angles, matching `RigidBody3D.orientation*` exactly,
// so a physics body's pose transfers to its collider with no conversion and no order convention to
// agree on. It is expected to be unit-length; a non-unit quaternion scales the box, which is a caller
// error rather than something this package normalizes on every support call.
export interface CollisionBox3D {
  x: number;
  y: number;
  z: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  rotationW: number;
}

// A capsule collider: the swept sphere of `radius` along the segment from (`x0`,`y0`,`z0`) to
// (`x1`,`y1`,`z1`).
//
// Stored as a segment plus a radius rather than as a centre, height, and axis, because that is the
// form its support function wants — the furthest point is the furthest ENDPOINT pushed one radius
// along the direction, with no trigonometry and no degenerate case when the segment has zero length
// (which is then simply a sphere).
export interface CollisionCapsule3D {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  radius: number;
}

// A convex hull collider: a flat `[x0,y0,z0,x1,y1,z1,...]` list of world-space vertices.
//
// Flat rather than an array of points, matching `CollisionPolygon2D` and for the same reasons: one
// allocation, cache-friendly to scan, and it lowers to a `float*` with no per-vertex object. CONVEXITY
// IS THE CALLER'S GUARANTEE — the support scan cannot detect a concave vertex, it just never returns
// it, so a concave hull silently behaves as its convex hull rather than failing.
export interface CollisionConvex3D {
  points: number[];
}

// A cylinder collider: the disc of `radius` swept along the segment from (`x0`,`y0`,`z0`) to
// (`x1`,`y1`,`z1`), with flat caps at both ends.
//
// Stored as a segment plus a radius, exactly like `CollisionCapsule3D`, so the two differ by their END
// TREATMENT alone — round for a capsule, flat for a cylinder — and a caller swapping one for the other
// changes only the `kind` string. The support function needs no trigonometry: the furthest point is the
// end cap the direction leans toward, offset by one radius along the direction's radial component.
//
// A zero-length segment is a degenerate cylinder (a flat disc) rather than the sphere a zero-length
// capsule collapses to, which is why validation treats the two differently.
export interface CollisionCylinder3D {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  radius: number;
}

// A cone collider: the hull of an apex point and a base disc of `radius` centred at (`baseX`,`baseY`,
// `baseZ`), lying in the plane perpendicular to the apex-to-base axis.
//
// Named ends rather than the `0`/`1` of capsule and cylinder, because a cone's two ends are NOT
// interchangeable: swapping them inverts the shape. `x0`/`x1` would leave which end is the point to a
// convention a reader has to remember, and getting it backwards produces a cone that still collides,
// just pointing the wrong way.
export interface CollisionCone3D {
  apexX: number;
  apexY: number;
  apexZ: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  radius: number;
}

export type CollisionBuiltInShape3D =
  | (CollisionSphere3D & { kind: 'sphere' })
  | (CollisionAabb3D & { kind: 'aabb' })
  | (CollisionBox3D & { kind: 'box' })
  | (CollisionCapsule3D & { kind: 'capsule' })
  | (CollisionCylinder3D & { kind: 'cylinder' })
  | (CollisionCone3D & { kind: 'cone' })
  | (CollisionConvex3D & { kind: 'convex' });

// A vendor-namespaced 3D collider kind: any string containing a dot. The same rule as
// `CollisionVendorKind2D`, and load-bearing for the same reason — see `CollisionVendorShape2D`.
export type CollisionVendorKind3D = `${string}.${string}`;

// A 3D collider of a kind this package does not define, reached entirely through the registries. Its
// parameters are deliberately absent: only the support function registered for that kind knows how to
// read them, and it is the one that casts.
export interface CollisionVendorShape3D {
  kind: CollisionVendorKind3D;
}

// Every 3D collider, built-in or vendor. `testCollision3D` and both 3D registries take this.
export type CollisionShape3D = CollisionBuiltInShape3D | CollisionVendorShape3D;

// The result of a 3D narrow-phase test, written into an `out` parameter so a hot loop over thousands
// of pairs allocates nothing. When `overlapping` is true, (`normalX`,`normalY`,`normalZ`) is the unit
// minimum-translation axis oriented to push shape **A out of B**, and `depth` is the penetration
// distance along it — moving A by `normal * depth` just separates the pair. When `overlapping` is
// false the pair is disjoint (or merely touching, which is treated as non-overlapping) and the normal
// and depth are left at 0.
export interface CollisionManifold3D {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  normalZ: number;
  depth: number;
}

// A support function: writes the furthest point on `shape` along (`dirX`,`dirY`,`dirZ`) into `out` as
// `[x,y,z]`. The direction need not be normalized.
//
// THE ARITY IS THE BOUNDARY. A 2D support takes two direction components and a 3D one takes three, so
// the two registries could not be crossed even if the kind strings collided. `out` is a caller-owned
// scratch array, never retained.
export type CollisionSupport3D = (
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
) => void;

// A registered specialization for one ORDERED pair of 3D kinds, written to beat the generic GJK/EPA
// path on speed or conditioning. Returns whether the pair overlaps, writing the manifold when it does.
export type CollisionPairTest3D = (
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
  out: CollisionManifold3D,
) => boolean;

// Installed by enableCollisionGuards and consulted only by the generic testCollision3D dispatcher, so
// the direct support and face-query lanes stay allocation-free. The 3D twin of `CollisionTestGuard2D`.
export type CollisionTestGuard3D = (a: Readonly<CollisionShape3D>, b: Readonly<CollisionShape3D>) => void;

// Plain-data answer to "why did testCollision3D return false?", carrying the same fields as its 2D twin
// and sharing `CollisionTestStatus` with it.
//
// It shares the status union but cannot produce every member: `'non-convex-polygon'` is unreachable in
// 3D, and that is a real difference between the dimensions rather than a hole here. A 2D `polygon` feeds
// its EDGE list to SAT, so a concave vertex produces a wrong answer and is worth naming. A 3D `convex`
// is reached only through its support scan, which takes the max over the point list and therefore never
// returns an interior vertex at all — a concave point set behaves as its convex hull, exactly as
// `CollisionConvex3D` documents. There is nothing to warn about, and a status that could never be
// emitted would be a promise this seam does not keep.
export interface CollisionTestExplanation3D {
  readonly kind: CollisionShapeKind3D | null;
  readonly overlapping: boolean;
  readonly shapeIndex: 0 | 1 | null;
  readonly status: CollisionTestStatus;
}

// One point of a 3D contact manifold: a world-space position on the shared surface and the penetration
// depth measured along the manifold's normal. `featureId` identifies WHICH feature pair produced the
// point, stably across frames, so a solver can match this step's points to last step's accumulators
// and warm-start. The value itself means nothing; only its stability is contracted.
export interface CollisionContactPoint3D {
  x: number;
  y: number;
  z: number;
  depth: number;
  featureId: number;
}

// A full 3D contact manifold: one shared normal plus the world-space points the two surfaces meet at.
//
// `points` is an array owned by the manifold and reused across calls; `pointCount` says how many
// leading entries are live, and entries beyond it hold stale values that must not be read. Where the
// 2D twin caps at two — the most a convex face-face pair can produce in the plane — a 3D face-face
// pair clips a POLYGON against a polygon, so the cap is four: enough to rest a box flat on a floor,
// which is the case the second lane exists for.
//
// This is the second lane, distinct from `CollisionManifold3D`, and the distinction is the same one
// the 2D half draws: the cheap overlap path must not start linking clipping machinery. A single
// deepest point is enough to know a pair touches and nowhere near enough to rest a box on a floor —
// that needs a polygon of contact, which is what face clipping produces and what a support function
// cannot, because a support function hides face topology by construction.
export interface CollisionContactManifold3D {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  normalZ: number;
  pointCount: number;
  points: CollisionContactPoint3D[];
}

// The most contact points a 3D convex pair can produce. Four, where the 2D twin caps at two: in the
// plane a convex face-face contact is a segment with two ends, and in space it is a POLYGON clipped
// against a polygon. Four is what rests a box flat on a floor — one per corner — which is the case the
// contact lane exists for, and clipping is capped there rather than at the clip's true maximum because
// a solver gains nothing from a fifth point on a coplanar face and pays an iteration for it.
export const MAX_COLLISION_CONTACT_POINTS_3D = 4;

// Writes the face of `shape` most aligned with a direction, as a flat `[x0,y0,z0,...]` polygon, and
// returns how many vertices it wrote.
//
// THIS IS THE SEAM A SUPPORT FUNCTION CANNOT FILL, and the reason the generic core is a floor rather
// than the whole package. GJK and EPA reach a shape only through "furthest point in a direction",
// which yields one point and one normal — enough to know a pair touches, and never enough to rest a
// box on a floor, because a resting box needs the four corners of a face and a support function hides
// face topology by construction.
//
// Returning 0 means the shape has no face along that direction and is not a coding error: a sphere is
// curved everywhere and touches at a point, which the contact layer handles by falling back to the
// single deepest point rather than by refusing the pair. A count of 2 is an edge — a capsule seen from
// the side — and clips exactly like a polygon with two vertices.
export type CollisionFaceQuery3D = (
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
) => number;

// Exact first intersection of a parametric ray `origin + direction * fraction` with one 3D shape.
// `raycastCollisionShape3D` rewrites this record and returns whether it is live. A zero normal means
// the origin was already inside the shape, where no outward-facing side was crossed.
export interface CollisionRaycastHit3D {
  fraction: number;
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

// The gap between two convex shapes and the axis along which it is measured.
//
// `direction` is a UNIT vector pointing from B toward A — the same orientation a contact normal uses, so
// a caller does not have to remember which way a distance query happens to face. It is left zeroed when
// `overlapping` is true, because a pair that already intersects has no gap and no unique axis; the
// penetration case is `CollisionManifold3D`'s.
// The WITNESS POINTS (`pointA*` and `pointB*`) are the closest points on each shape's surface: the pair
// that realizes `distance`, so `pointA - pointB` is `distance` along `direction`. They are reported in
// the frame the query was posed in, which for an offset query means A already carries the offset.
//
// They are EXACT where the closest feature is interior to an edge or a face — two crossing capsules meet
// mid-segment, and a witness lands there, where a support function queried along the normal returns a
// segment END and misplaces the point by half the shape.
//
// They are NOT a substitute for a manifold. When the closest features are parallel every point of the
// shared region is equally close, the search settles on whichever one the support function's tie-break
// names, and that is a CORNER of the region rather than its centre. So a witness is a point the shapes
// genuinely touch at, but a face-face contact is an area, and no single point represents it: reading one
// as a lever arm gives a squarely-struck box a spin it should not have. Use `CollisionContactManifold3D`
// where the contact patch matters, and a witness where a single closest point is the actual question.
export interface CollisionDistance3D {
  distance: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  pointAX: number;
  pointAY: number;
  pointAZ: number;
  pointBX: number;
  pointBY: number;
  pointBZ: number;
  overlapping: boolean;
}

// The first moment two shapes touch under linear translation, as a fraction of the swept interval.
//
// `fraction` is 0 when they already touch at the start and 1 when they touch only at the very end.
// (`x`,`y`,`z`) is where contact happens and the normal points from B toward A, matching
// `CollisionDistance3D` and the contact normal convention.
export interface CollisionTimeOfImpact3D {
  fraction: number;
  x: number;
  y: number;
  z: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}
