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
// The 3D half does not exist yet. When it lands it is a sibling set of types with the same shape and a
// `3D` suffix, plus `testCollision3D`; nothing here becomes shared. See
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

// The tagged union over every built-in collider, discriminated by `kind`. The generic
// `testCollision2D` dispatches on the two shapes' kinds; the direct per-pair tests
// (`testCircleCircleCollision`, ...) take the bare shape types and are the hot path.
export type CollisionShape2D =
  | (CollisionCircle2D & { kind: 'circle' })
  | (CollisionAabb2D & { kind: 'aabb' })
  | (CollisionObb2D & { kind: 'obb' })
  | (CollisionPolygon2D & { kind: 'polygon' })
  | (CollisionSegment2D & { kind: 'segment' })
  | (CollisionPoint2D & { kind: 'point' });

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
