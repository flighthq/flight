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
