// 2D narrow-phase collision header. `@flighthq/collision` tests one collider pair for overlap and,
// when they overlap, writes a CollisionManifold — the minimum-translation vector that separates the
// pair. Shapes are plain data (kind + parameters), decoupled from the scene graph; a game maps its
// entities onto these. This is the detection layer a physics step or trigger system queries after a
// broadphase has narrowed the candidate pairs; it does not resolve penetration or integrate motion.
// Distinct from @flighthq/geometry (whose Aabb/Obb/sphere are 3D) and @flighthq/interaction (pointer
// hit-testing against display objects): these are general 2D collider-vs-collider colliders.

// The identifier for a 2D collider shape. Open union: the six built-in kinds plus any string, so a
// vendor can add a custom collider kind (namespaced, e.g. `'acme.capsule'`). The `(string & {})` arm
// keeps autocomplete for the built-ins while still accepting any string.
export type CollisionShapeKind = 'circle' | 'aabb' | 'obb' | 'polygon' | 'segment' | 'point' | (string & {});

// A circle collider: center (`x`,`y`) and `radius`.
export interface CollisionCircle {
  x: number;
  y: number;
  radius: number;
}

// An axis-aligned bounding box collider, stored as its min/max corners. This is the 2D collision
// AABB — distinct from @flighthq/geometry's 3D `Aabb`.
export interface CollisionAabb {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// An oriented bounding box collider: center (`x`,`y`), half-extents (`halfW`,`halfH`) along the box's
// own local axes, and `rotation` in radians (counter-clockwise, applied about the center).
export interface CollisionObb {
  x: number;
  y: number;
  halfW: number;
  halfH: number;
  rotation: number;
}

// A convex polygon collider. `points` is a flat `[x0,y0,x1,y1,...]` list of at least three vertices.
// The polygon is assumed **convex** and simple; concave input produces undefined manifolds. Winding
// (CW or CCW) does not matter — the tests are winding-agnostic and orient the manifold by centroid.
export interface CollisionPolygon {
  points: readonly number[];
}

// A line-segment collider from (`x0`,`y0`) to (`x1`,`y1`). Segments are area-less: they answer
// boolean overlap queries (`testSegment*Collision`), not manifolds.
export interface CollisionSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// A single point collider at (`x`,`y`). Area-less: it answers containment queries, not manifolds.
export interface CollisionPoint {
  x: number;
  y: number;
}

// The tagged union over every built-in collider, discriminated by `kind`. The generic
// `testCollision` dispatches on the two shapes' kinds; the direct per-pair tests
// (`testCircleCircleCollision`, ...) take the bare shape types and are the hot path.
export type CollisionShape =
  | (CollisionCircle & { kind: 'circle' })
  | (CollisionAabb & { kind: 'aabb' })
  | (CollisionObb & { kind: 'obb' })
  | (CollisionPolygon & { kind: 'polygon' })
  | (CollisionSegment & { kind: 'segment' })
  | (CollisionPoint & { kind: 'point' });

// The result of a narrow-phase test, written into an `out` parameter so a hot loop over thousands of
// pairs allocates nothing. When `overlapping` is true, (`normalX`,`normalY`) is the unit
// minimum-translation axis oriented to push shape **A out of B**, and `depth` is the penetration
// distance along it — moving A by `normal * depth` just separates the pair. When `overlapping` is
// false the pair is disjoint (or merely touching, which is treated as non-overlapping) and
// `normalX`/`normalY`/`depth` are left at 0.
export interface CollisionManifold {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  depth: number;
}

// Plain-data answer to "why did testCollision return false?". `shapeIndex` identifies invalid or
// unsupported input (0 for A, 1 for B); it is null for an ordinary separated pair or an overlap.
export interface CollisionTestExplanation {
  readonly kind: CollisionShapeKind | null;
  readonly overlapping: boolean;
  readonly shapeIndex: 0 | 1 | null;
  readonly status: CollisionTestStatus;
}

// The result classification shared by explainCollisionTest and the opt-in guard seam.
export type CollisionTestStatus =
  | 'degenerate-shape'
  | 'non-convex-polygon'
  | 'overlapping'
  | 'separated'
  | 'unsupported-shape-kind';

// Installed by enableCollisionGuards and consulted only by the generic testCollision dispatcher.
// Direct typed pair functions remain the allocation-free hot path.
export type CollisionTestGuard = (a: Readonly<CollisionShape>, b: Readonly<CollisionShape>) => void;

// One point of contact between two overlapping shapes. (`x`,`y`) is the world-space anchor and
// `depth` is that point's own penetration along the manifold normal — points on the same manifold
// generally penetrate by different amounts, which is what lets a solver correct a tilted resting
// contact. `featureId` is an opaque integer naming which pair of shape features (edges/vertices)
// produced the point: it is stable frame to frame while the same features stay in contact, so a
// physics solver can match this frame's point against last frame's cached impulse and warm-start it.
// Treat the value as an identity token only — nothing is encoded for callers to read.
export interface CollisionContactPoint {
  x: number;
  y: number;
  depth: number;
  featureId: number;
}

// The full contact manifold: everything `CollisionManifold` reports plus the world-space points at
// which the two shapes actually touch. A minimum-translation normal alone is enough to *separate* a
// pair, but not to simulate one — a rigid-body impulse acts at a point, and its angular term is the
// cross product of the lever arm (contact point minus center of mass) with the normal. With no
// point there is no lever arm, so contact can never produce torque: a box would slide down a slope
// without ever tipping. `@flighthq/physics2d` consumes this; a trigger system or overlap query
// wants the cheaper `CollisionManifold` and the `test*Collision` functions instead.
//
// `overlapping`, `normalX`, `normalY`, and `depth` carry exactly the `CollisionManifold` meaning —
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
export interface CollisionContactManifold {
  overlapping: boolean;
  normalX: number;
  normalY: number;
  depth: number;
  pointCount: number;
  points: CollisionContactPoint[];
}
