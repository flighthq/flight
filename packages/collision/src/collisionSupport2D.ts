import type {
  CollisionAabb2D,
  CollisionCircle2D,
  CollisionObb2D,
  CollisionPairTest2D,
  CollisionPolygon2D,
  CollisionShape2D,
  CollisionShapeKind2D,
  CollisionSupport2D,
} from '@flighthq/types/contract';

import { writeObbVertices } from './convexVertices';

// The two registries the narrow phase dispatches through.
//
// A SUPPORT REGISTRY keyed by shape kind is the floor: registering one function makes a shape work
// against every other registered shape immediately, through GJK/EPA. A PAIR REGISTRY keyed by the
// ordered kind pair sits over it, so a pair that earns a faster or better-conditioned path takes it.
// The result is O(N) coverage with O(1) hot paths, and a new shape is useful the moment its support
// function exists rather than after someone authors its column of the pair matrix.
//
// Registration is explicit and last-write-wins, matching every other registry in the SDK: a caller may
// override a built-in binding, and collisions are avoided by the vendor-prefix convention rather than
// by a guard that would make overriding impossible. Nothing here registers at module load, so a bundle
// that never calls `registerBuiltInCollisionSupports2D` links no support math.

// The specialization registered for this ORDERED pair, or null. The caller tries both orders and
// negates the normal when the reverse one answers, because a manifold is oriented A-out-of-B.
export function getCollisionPairTest2D(
  kindA: CollisionShapeKind2D,
  kindB: CollisionShapeKind2D,
): CollisionPairTest2D | null {
  return collisionPairTests2D.get(getCollisionPairKey2D(kindA, kindB)) ?? null;
}

// The support function registered for `kind`, or null when none is. A missing support is an expected
// condition rather than an error: an area-less kind has no manifold to produce, and a vendor kind
// nobody registered is exactly the case `explainCollisionTest2D` reports and the guard warns about.
export function getCollisionSupport2D(kind: CollisionShapeKind2D): CollisionSupport2D | null {
  return collisionSupports2D.get(kind) ?? null;
}

// Installs the four built-in area kinds' support functions. Kept an explicit assembly rather than part
// of module load, so a caller using only the direct typed pair functions links none of this.
//
// `segment` and `point` are deliberately absent. They are area-less by design: a support function
// could be written for either, and GJK would then happily report a segment "overlapping" a box with a
// penetration depth that means nothing a solver can act on. The absence is the boundary.
export function registerBuiltInCollisionSupports2D(): void {
  registerCollisionSupport2D('aabb', supportCollisionAabb2D);
  registerCollisionSupport2D('circle', supportCollisionCircle2D);
  registerCollisionSupport2D('obb', supportCollisionObb2D);
  registerCollisionSupport2D('polygon', supportCollisionPolygon2D);
}

export function registerCollisionPairTest2D(
  kindA: CollisionShapeKind2D,
  kindB: CollisionShapeKind2D,
  test: CollisionPairTest2D,
): void {
  collisionPairTests2D.set(getCollisionPairKey2D(kindA, kindB), test);
}

export function registerCollisionSupport2D(kind: CollisionShapeKind2D, support: CollisionSupport2D): void {
  collisionSupports2D.set(kind, support);
}

// The furthest point on an axis-aligned box along a direction — the corner the direction's signs pick
// out, with no search. Every box support is exact and branch-cheap, which is why boxes never need a
// pair specialization for correctness, only for the contact points clipping gives them.
export function supportCollisionAabb2D(
  shape: Readonly<CollisionShape2D>,
  dirX: number,
  dirY: number,
  out: number[],
): void {
  const aabb = shape as CollisionAabb2D;
  out[0] = dirX >= 0 ? aabb.maxX : aabb.minX;
  out[1] = dirY >= 0 ? aabb.maxY : aabb.minY;
}

// The furthest point on a circle: its centre pushed one radius along the direction.
//
// This is the case a vertex list cannot express, and the reason the support function is the right
// primitive rather than `convexVertices` carried one step further. A zero direction has no furthest
// point, so the centre is returned — a legal answer that keeps a degenerate GJK step finite.
export function supportCollisionCircle2D(
  shape: Readonly<CollisionShape2D>,
  dirX: number,
  dirY: number,
  out: number[],
): void {
  const circle = shape as CollisionCircle2D;
  const length = Math.sqrt(dirX * dirX + dirY * dirY);
  if (length === 0) {
    out[0] = circle.x;
    out[1] = circle.y;
    return;
  }
  const scale = circle.radius / length;
  out[0] = circle.x + dirX * scale;
  out[1] = circle.y + dirY * scale;
}

// The furthest corner of an oriented box. Materialized through the shared vertex writer rather than by
// rotating the direction into the box's frame: both are four multiplies, and going through the same
// corner list the SAT core uses means the two can never disagree about where a corner is.
export function supportCollisionObb2D(
  shape: Readonly<CollisionShape2D>,
  dirX: number,
  dirY: number,
  out: number[],
): void {
  writeObbVertices(shape as CollisionObb2D, scratchVertices);
  writeVertexListSupport2D(scratchVertices, 4, dirX, dirY, out);
}

// The furthest vertex of a convex polygon, by linear scan. Linear rather than by hill-climbing the
// edge loop: a collider polygon is a handful of vertices, and a scan has no winding assumption to get
// wrong.
export function supportCollisionPolygon2D(
  shape: Readonly<CollisionShape2D>,
  dirX: number,
  dirY: number,
  out: number[],
): void {
  const points = (shape as CollisionPolygon2D).points;
  writeVertexListSupport2D(points, points.length >> 1, dirX, dirY, out);
}

// Writes the furthest of `count` vertices along a direction, reading a flat `[x0,y0,x1,y1,...]` list.
// The shared tail of every polytope support.
export function writeVertexListSupport2D(
  vertices: Readonly<ArrayLike<number>>,
  count: number,
  dirX: number,
  dirY: number,
  out: number[],
): void {
  let bestX = vertices[0];
  let bestY = vertices[1];
  let best = bestX * dirX + bestY * dirY;
  for (let i = 1; i < count; i += 1) {
    const x = vertices[i * 2];
    const y = vertices[i * 2 + 1];
    const projection = x * dirX + y * dirY;
    if (projection > best) {
      best = projection;
      bestX = x;
      bestY = y;
    }
  }
  out[0] = bestX;
  out[1] = bestY;
}

// Packs an ordered kind pair into one map key, separated by NUL. Concatenating the two kinds directly
// would let `('ab','c')` and `('a','bc')` land on one entry — a collision that cannot occur among the
// built-ins and appears the first time someone registers a vendor kind whose name is a prefix of
// another, which is exactly when nobody is looking for it.
function getCollisionPairKey2D(kindA: CollisionShapeKind2D, kindB: CollisionShapeKind2D): string {
  return `${kindA}\u0000${kindB}`;
}

const collisionPairTests2D = new Map<string, CollisionPairTest2D>();
const collisionSupports2D = new Map<CollisionShapeKind2D, CollisionSupport2D>();
const scratchVertices = new Float64Array(8);
