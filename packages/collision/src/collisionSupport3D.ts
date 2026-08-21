import type {
  CollisionAabb3D,
  CollisionBox3D,
  CollisionCapsule3D,
  CollisionConvex3D,
  CollisionPairTest3D,
  CollisionShape3D,
  CollisionShapeKind3D,
  CollisionSphere3D,
  CollisionSupport3D,
} from '@flighthq/types/contract';

// The two registries the 3D narrow phase dispatches through — the same pair the 2D half uses, keyed by
// 3D kinds and holding 3D support functions.
//
// They are SEPARATE MAPS from the 2D ones rather than one map keyed by a wider kind, and that is the
// runtime half of the dimension boundary the types draw at compile time. The static half already makes
// a sphere unassignable to `testCollision2D`; keeping the maps apart means even a caller reaching the
// registries through a cast cannot land a 3-vector support function where a 2-vector one is expected.
//
// Registration is explicit and last-write-wins, matching every other registry in the SDK. Nothing here
// registers at module load, so a bundle that never calls `registerBuiltInCollisionSupports3D` links no
// support math.

// The specialization registered for this ORDERED pair, or null. The caller tries both orders and
// negates the normal when the reverse one answers, because a manifold is oriented A-out-of-B.
export function getCollisionPairTest3D(
  kindA: CollisionShapeKind3D,
  kindB: CollisionShapeKind3D,
): CollisionPairTest3D | null {
  return collisionPairTests3D.get(getCollisionPairKey3D(kindA, kindB)) ?? null;
}

// The support function registered for `kind`, or null when none is. A missing support is an expected
// condition rather than an error: it is the case `explainCollisionTest3D` reports and the guard warns
// about.
export function getCollisionSupport3D(kind: CollisionShapeKind3D): CollisionSupport3D | null {
  return collisionSupports3D.get(kind) ?? null;
}

// Installs the five built-in convex kinds' support functions. Kept an explicit assembly rather than
// part of module load, so a caller that never runs a 3D test links none of this.
export function registerBuiltInCollisionSupports3D(): void {
  registerCollisionSupport3D('aabb', supportCollisionAabb3D);
  registerCollisionSupport3D('box', supportCollisionBox3D);
  registerCollisionSupport3D('capsule', supportCollisionCapsule3D);
  registerCollisionSupport3D('convex', supportCollisionConvex3D);
  registerCollisionSupport3D('sphere', supportCollisionSphere3D);
}

export function registerCollisionPairTest3D(
  kindA: CollisionShapeKind3D,
  kindB: CollisionShapeKind3D,
  test: CollisionPairTest3D,
): void {
  collisionPairTests3D.set(getCollisionPairKey3D(kindA, kindB), test);
}

export function registerCollisionSupport3D(kind: CollisionShapeKind3D, support: CollisionSupport3D): void {
  collisionSupports3D.set(kind, support);
}

// The furthest point on an axis-aligned box: the corner the direction's signs pick out, with no search.
export function supportCollisionAabb3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  const aabb = shape as CollisionAabb3D;
  out[0] = dirX >= 0 ? aabb.maxX : aabb.minX;
  out[1] = dirY >= 0 ? aabb.maxY : aabb.minY;
  out[2] = dirZ >= 0 ? aabb.maxZ : aabb.minZ;
}

// The furthest corner of an oriented box.
//
// Computed by rotating the direction into the box's own frame, picking the corner there by sign, and
// rotating that corner back — six multiplies of quaternion work rather than materializing all eight
// corners and scanning them. The 2D twin goes through a shared vertex list instead, because in two
// dimensions there are only four corners and a shared list keeps the SAT core and the support function
// from ever disagreeing about where one is. In three dimensions there are eight, no SAT core reads
// them, and the local-frame form is both cheaper and exact.
export function supportCollisionBox3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  const box = shape as CollisionBox3D;
  // Into the box's frame: rotate by the CONJUGATE, which is the inverse for a unit quaternion.
  rotateVectorByQuaternion(
    dirX,
    dirY,
    dirZ,
    -box.rotationX,
    -box.rotationY,
    -box.rotationZ,
    box.rotationW,
    localDirection,
  );
  const cornerX = localDirection[0] >= 0 ? box.halfX : -box.halfX;
  const cornerY = localDirection[1] >= 0 ? box.halfY : -box.halfY;
  const cornerZ = localDirection[2] >= 0 ? box.halfZ : -box.halfZ;
  rotateVectorByQuaternion(
    cornerX,
    cornerY,
    cornerZ,
    box.rotationX,
    box.rotationY,
    box.rotationZ,
    box.rotationW,
    localCorner,
  );
  out[0] = box.x + localCorner[0];
  out[1] = box.y + localCorner[1];
  out[2] = box.z + localCorner[2];
}

// The furthest point on a capsule: the further of its two segment endpoints along the direction, pushed
// one radius further along it.
//
// This is the composition the capsule exists to demonstrate — a segment's support plus a sphere's — and
// it is why a capsule needs no special case anywhere else in the core. A zero-length segment degenerates
// to a sphere with no branch, and a zero direction has no furthest point, so the first endpoint is
// returned to keep a degenerate GJK step finite.
export function supportCollisionCapsule3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  const capsule = shape as CollisionCapsule3D;
  const projection0 = capsule.x0 * dirX + capsule.y0 * dirY + capsule.z0 * dirZ;
  const projection1 = capsule.x1 * dirX + capsule.y1 * dirY + capsule.z1 * dirZ;
  const useSecond = projection1 > projection0;
  const baseX = useSecond ? capsule.x1 : capsule.x0;
  const baseY = useSecond ? capsule.y1 : capsule.y0;
  const baseZ = useSecond ? capsule.z1 : capsule.z0;
  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (length === 0) {
    out[0] = baseX;
    out[1] = baseY;
    out[2] = baseZ;
    return;
  }
  const scale = capsule.radius / length;
  out[0] = baseX + dirX * scale;
  out[1] = baseY + dirY * scale;
  out[2] = baseZ + dirZ * scale;
}

// The furthest vertex of a convex hull, by linear scan. Linear rather than by hill-climbing the
// adjacency graph: a collider hull is a handful of vertices, and a scan needs no adjacency data the
// flat point list does not carry.
export function supportCollisionConvex3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  const points = (shape as CollisionConvex3D).points;
  writeVertexListSupport3D(points, Math.floor(points.length / 3), dirX, dirY, dirZ, out);
}

// The furthest point on a sphere: its centre pushed one radius along the direction.
//
// This is the case a vertex list cannot express, and the reason the support function is the right
// primitive. A zero direction has no furthest point, so the centre is returned — a legal answer that
// keeps a degenerate GJK step finite.
export function supportCollisionSphere3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  const sphere = shape as CollisionSphere3D;
  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (length === 0) {
    out[0] = sphere.x;
    out[1] = sphere.y;
    out[2] = sphere.z;
    return;
  }
  const scale = sphere.radius / length;
  out[0] = sphere.x + dirX * scale;
  out[1] = sphere.y + dirY * scale;
  out[2] = sphere.z + dirZ * scale;
}

// Writes the furthest of `count` vertices along a direction, reading a flat `[x0,y0,z0,x1,...]` list.
// The shared tail of every polytope support.
export function writeVertexListSupport3D(
  vertices: Readonly<ArrayLike<number>>,
  count: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): void {
  let bestX = vertices[0];
  let bestY = vertices[1];
  let bestZ = vertices[2];
  let best = bestX * dirX + bestY * dirY + bestZ * dirZ;
  for (let i = 1; i < count; i += 1) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    const projection = x * dirX + y * dirY + z * dirZ;
    if (projection > best) {
      best = projection;
      bestX = x;
      bestY = y;
      bestZ = z;
    }
  }
  out[0] = bestX;
  out[1] = bestY;
  out[2] = bestZ;
}

// Packs an ordered kind pair into one map key, separated by NUL. Concatenating the two kinds directly
// would let `('ab','c')` and `('a','bc')` land on one entry — a collision that cannot occur among the
// built-ins and appears the first time someone registers a vendor kind whose name is a prefix of
// another, which is exactly when nobody is looking for it.
function getCollisionPairKey3D(kindA: CollisionShapeKind3D, kindB: CollisionShapeKind3D): string {
  return `${kindA}\u0000${kindB}`;
}

// Rotates a vector by a quaternion, writing `[x,y,z]`. Uses the standard two-cross-product form
// `v + 2 * (q.xyz X (q.xyz X v + w * v))`, which costs no matrix and no normalization. Passing the
// conjugate (negated xyz) rotates by the inverse, for a unit quaternion.
function rotateVectorByQuaternion(
  vectorX: number,
  vectorY: number,
  vectorZ: number,
  quaternionX: number,
  quaternionY: number,
  quaternionZ: number,
  quaternionW: number,
  out: number[],
): void {
  const tempX = quaternionY * vectorZ - quaternionZ * vectorY + quaternionW * vectorX;
  const tempY = quaternionZ * vectorX - quaternionX * vectorZ + quaternionW * vectorY;
  const tempZ = quaternionX * vectorY - quaternionY * vectorX + quaternionW * vectorZ;
  out[0] = vectorX + 2 * (quaternionY * tempZ - quaternionZ * tempY);
  out[1] = vectorY + 2 * (quaternionZ * tempX - quaternionX * tempZ);
  out[2] = vectorZ + 2 * (quaternionX * tempY - quaternionY * tempX);
}

const collisionPairTests3D = new Map<string, CollisionPairTest3D>();
const collisionSupports3D = new Map<CollisionShapeKind3D, CollisionSupport3D>();
const localCorner = [0, 0, 0];
const localDirection = [0, 0, 0];
