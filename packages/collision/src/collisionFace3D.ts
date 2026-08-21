import type {
  CollisionAabb3D,
  CollisionBox3D,
  CollisionCapsule3D,
  CollisionConvex3D,
  CollisionFaceQuery3D,
  CollisionShape3D,
  CollisionShapeKind3D,
} from '@flighthq/types/contract';

// The face registry: the shape-aware half of the narrow phase, sitting beside the shape-agnostic
// support registry.
//
// `agents/collision-support-registry.md` names this boundary exactly — "GJK/EPA yields a normal and
// one deepest point, not a manifold … the clipping layer stays shape-aware" — and this is where that
// stays true. A kind that registers only a support function collides correctly and rests badly; one
// that also registers a face query can be stacked. Keeping them separate registries means the second
// is optional, which is what lets a sphere decline to have faces without declining to collide.

// The face query registered for `kind`, or null when none is. Null is an ordinary answer: a curved
// kind has no faces to give, and the contact layer falls back to a single point.
export function getCollisionFaceQuery3D(kind: CollisionShapeKind3D): CollisionFaceQuery3D | null {
  return collisionFaceQueries3D.get(kind) ?? null;
}

// The face of an axis-aligned box most aligned with the direction: whichever of the six the direction's
// dominant axis picks out, wound counter-clockwise seen from outside.
export function queryCollisionAabbFace3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): number {
  const box = shape as CollisionAabb3D;
  writeBoxFaceCorners(
    (box.minX + box.maxX) / 2,
    (box.minY + box.maxY) / 2,
    (box.minZ + box.maxZ) / 2,
    (box.maxX - box.minX) / 2,
    (box.maxY - box.minY) / 2,
    (box.maxZ - box.minZ) / 2,
    dirX,
    dirY,
    dirZ,
    IDENTITY_ROTATION,
    out,
  );
  return 4;
}

// The face of an oriented box most aligned with the direction. The direction is rotated into the box's
// frame, the face is picked there by dominant axis, and its four corners are rotated back out — the
// same round trip the box support function makes, so the two can never disagree about where a corner
// is.
export function queryCollisionBoxFace3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): number {
  const box = shape as CollisionBox3D;
  rotation[0] = box.rotationX;
  rotation[1] = box.rotationY;
  rotation[2] = box.rotationZ;
  rotation[3] = box.rotationW;
  writeBoxFaceCorners(box.x, box.y, box.z, box.halfX, box.halfY, box.halfZ, dirX, dirY, dirZ, rotation, out);
  return 4;
}

// A capsule's "face" is its axis segment, offset one radius along the direction — two vertices, which
// is an EDGE rather than a polygon and clips as one.
//
// Returns 0 when the direction runs along the axis, because the capsule is then presenting one of its
// spherical caps and a cap is curved: there is no flat feature to clip, and the single-point fallback
// is the honest answer. The cutoff is generous on purpose — a capsule lying almost flat on a floor
// should still get two points, since one point is what makes it roll.
export function queryCollisionCapsuleFace3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): number {
  const capsule = shape as CollisionCapsule3D;
  const axisX = capsule.x1 - capsule.x0;
  const axisY = capsule.y1 - capsule.y0;
  const axisZ = capsule.z1 - capsule.z0;
  const axisLength = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
  const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (axisLength <= FACE_EPSILON || dirLength <= FACE_EPSILON) return 0;
  const alignment = Math.abs((axisX * dirX + axisY * dirY + axisZ * dirZ) / (axisLength * dirLength));
  if (alignment > CAPSULE_AXIS_ALIGNMENT_LIMIT) return 0;
  const scale = capsule.radius / dirLength;
  out[0] = capsule.x0 + dirX * scale;
  out[1] = capsule.y0 + dirY * scale;
  out[2] = capsule.z0 + dirZ * scale;
  out[3] = capsule.x1 + dirX * scale;
  out[4] = capsule.y1 + dirY * scale;
  out[5] = capsule.z1 + dirZ * scale;
  return 2;
}

// The supporting face of a convex hull, derived from the vertex list ALONE — no topology needed.
//
// Every vertex within a tolerance of the maximum projection along the direction lies on the supporting
// face, because that is what a supporting face IS: the set of points the direction cannot distinguish.
// So the face falls out of the same scan the support function already runs, and `CollisionConvex3D`
// needs no face indices, no winding convention, and no way for its topology to disagree with its
// points. The cost is a tolerance where explicit topology would have been exact, which is the right
// trade for a collider hull of a handful of vertices.
//
// The gathered vertices are then wound by angle about their own centroid, in the face's plane, so
// clipping sees a simple polygon rather than the arbitrary order the input happened to use.
export function queryCollisionConvexFace3D(
  shape: Readonly<CollisionShape3D>,
  dirX: number,
  dirY: number,
  dirZ: number,
  out: number[],
): number {
  const points = (shape as CollisionConvex3D).points;
  const count = Math.floor(points.length / 3);
  if (count === 0) return 0;
  const dirLength = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
  if (dirLength <= FACE_EPSILON) return 0;
  const unitX = dirX / dirLength;
  const unitY = dirY / dirLength;
  const unitZ = dirZ / dirLength;

  let best = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const projection = points[i * 3] * unitX + points[i * 3 + 1] * unitY + points[i * 3 + 2] * unitZ;
    if (projection > best) best = projection;
  }

  let written = 0;
  for (let i = 0; i < count && written < MAX_FACE_VERTICES; i += 1) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    if (best - (x * unitX + y * unitY + z * unitZ) > FACE_PLANE_TOLERANCE) continue;
    out[written * 3] = x;
    out[written * 3 + 1] = y;
    out[written * 3 + 2] = z;
    written += 1;
  }
  if (written < 3) return written;
  sortFaceVerticesByAngle(out, written, unitX, unitY, unitZ);
  return written;
}

// Installs the built-in face queries. `sphere` is deliberately absent rather than registered as a
// zero-returning stub: absent and "returns no face" reach the same fallback, and one of them does not
// require writing a function whose whole body is a lie about having tried.
export function registerBuiltInCollisionFaceQueries3D(): void {
  registerCollisionFaceQuery3D('aabb', queryCollisionAabbFace3D);
  registerCollisionFaceQuery3D('box', queryCollisionBoxFace3D);
  registerCollisionFaceQuery3D('capsule', queryCollisionCapsuleFace3D);
  registerCollisionFaceQuery3D('convex', queryCollisionConvexFace3D);
}

export function registerCollisionFaceQuery3D(kind: CollisionShapeKind3D, query: CollisionFaceQuery3D): void {
  collisionFaceQueries3D.set(kind, query);
}

// Rotates a vector by a quaternion, writing `[x,y,z]`. The same two-cross-product form the support
// module uses; duplicated rather than shared because the two modules are separate compilation units in
// the C port and neither should pull the other in for four lines of arithmetic.
function rotateFaceVector(
  vectorX: number,
  vectorY: number,
  vectorZ: number,
  quaternion: Readonly<number[]>,
  conjugate: boolean,
  out: number[],
): void {
  const sign = conjugate ? -1 : 1;
  const qx = quaternion[0] * sign;
  const qy = quaternion[1] * sign;
  const qz = quaternion[2] * sign;
  const qw = quaternion[3];
  const tempX = qy * vectorZ - qz * vectorY + qw * vectorX;
  const tempY = qz * vectorX - qx * vectorZ + qw * vectorY;
  const tempZ = qx * vectorY - qy * vectorX + qw * vectorZ;
  out[0] = vectorX + 2 * (qy * tempZ - qz * tempY);
  out[1] = vectorY + 2 * (qz * tempX - qx * tempZ);
  out[2] = vectorZ + 2 * (qx * tempY - qy * tempX);
}

// Orders coplanar vertices counter-clockwise about their centroid, in the plane the unit normal
// defines. An insertion sort: a face has a handful of vertices, and the ordering must be total and
// deterministic rather than fast.
function sortFaceVerticesByAngle(
  vertices: number[],
  count: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): void {
  let centroidX = 0;
  let centroidY = 0;
  let centroidZ = 0;
  for (let i = 0; i < count; i += 1) {
    centroidX += vertices[i * 3];
    centroidY += vertices[i * 3 + 1];
    centroidZ += vertices[i * 3 + 2];
  }
  centroidX /= count;
  centroidY /= count;
  centroidZ /= count;

  // Any two perpendicular axes spanning the face's plane serve as its coordinate frame; which two
  // decides where angle zero sits, and that only rotates the ordering rather than changing it.
  writeFacePlaneAxis(normalX, normalY, normalZ, planeAxisU);
  planeAxisV[0] = normalY * planeAxisU[2] - normalZ * planeAxisU[1];
  planeAxisV[1] = normalZ * planeAxisU[0] - normalX * planeAxisU[2];
  planeAxisV[2] = normalX * planeAxisU[1] - normalY * planeAxisU[0];

  for (let i = 0; i < count; i += 1) {
    const offsetX = vertices[i * 3] - centroidX;
    const offsetY = vertices[i * 3 + 1] - centroidY;
    const offsetZ = vertices[i * 3 + 2] - centroidZ;
    faceAngles[i] = Math.atan2(
      offsetX * planeAxisV[0] + offsetY * planeAxisV[1] + offsetZ * planeAxisV[2],
      offsetX * planeAxisU[0] + offsetY * planeAxisU[1] + offsetZ * planeAxisU[2],
    );
  }

  for (let i = 1; i < count; i += 1) {
    const angle = faceAngles[i];
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    let j = i - 1;
    while (j >= 0 && faceAngles[j] > angle) {
      faceAngles[j + 1] = faceAngles[j];
      vertices[(j + 1) * 3] = vertices[j * 3];
      vertices[(j + 1) * 3 + 1] = vertices[j * 3 + 1];
      vertices[(j + 1) * 3 + 2] = vertices[j * 3 + 2];
      j -= 1;
    }
    faceAngles[j + 1] = angle;
    vertices[(j + 1) * 3] = x;
    vertices[(j + 1) * 3 + 1] = y;
    vertices[(j + 1) * 3 + 2] = z;
  }
}

// Writes some unit vector perpendicular to the normal, crossing against whichever cardinal axis the
// normal is least aligned with so the result can never collapse to zero.
function writeFacePlaneAxis(normalX: number, normalY: number, normalZ: number, out: number[]): void {
  const absX = Math.abs(normalX);
  const absY = Math.abs(normalY);
  const absZ = Math.abs(normalZ);
  const axisX = absX <= absY && absX <= absZ ? 1 : 0;
  const axisY = axisX === 0 && absY <= absZ ? 1 : 0;
  const axisZ = axisX === 0 && axisY === 0 ? 1 : 0;
  let x = normalY * axisZ - normalZ * axisY;
  let y = normalZ * axisX - normalX * axisZ;
  let z = normalX * axisY - normalY * axisX;
  const length = Math.sqrt(x * x + y * y + z * z);
  if (length > FACE_EPSILON) {
    x /= length;
    y /= length;
    z /= length;
  }
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

// Writes the four corners of the box face the direction selects, for a box given as centre, half
// extents, and a rotation. Shared by the axis-aligned and oriented queries so the two cannot drift;
// the axis-aligned one passes the identity rotation and pays two no-op rotations for it.
function writeBoxFaceCorners(
  centreX: number,
  centreY: number,
  centreZ: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  quaternion: Readonly<number[]>,
  out: number[],
): void {
  rotateFaceVector(dirX, dirY, dirZ, quaternion, true, localFaceDirection);
  const localX = localFaceDirection[0];
  const localY = localFaceDirection[1];
  const localZ = localFaceDirection[2];
  const absX = Math.abs(localX);
  const absY = Math.abs(localY);
  const absZ = Math.abs(localZ);

  // The dominant local axis names the face; the other two span it.
  let axis = 0;
  if (absY >= absX && absY >= absZ) axis = 1;
  else if (absZ >= absX && absZ >= absY) axis = 2;
  const sign = (axis === 0 ? localX : axis === 1 ? localY : localZ) >= 0 ? 1 : -1;

  for (let corner = 0; corner < 4; corner += 1) {
    const uSign = corner === 0 || corner === 3 ? -1 : 1;
    const vSign = corner < 2 ? -1 : 1;
    if (axis === 0) {
      localFaceCorner[0] = halfX * sign;
      localFaceCorner[1] = halfY * uSign;
      localFaceCorner[2] = halfZ * vSign;
    } else if (axis === 1) {
      localFaceCorner[0] = halfX * vSign;
      localFaceCorner[1] = halfY * sign;
      localFaceCorner[2] = halfZ * uSign;
    } else {
      localFaceCorner[0] = halfX * uSign;
      localFaceCorner[1] = halfY * vSign;
      localFaceCorner[2] = halfZ * sign;
    }
    rotateFaceVector(localFaceCorner[0], localFaceCorner[1], localFaceCorner[2], quaternion, false, rotatedCorner);
    out[corner * 3] = centreX + rotatedCorner[0];
    out[corner * 3 + 1] = centreY + rotatedCorner[1];
    out[corner * 3 + 2] = centreZ + rotatedCorner[2];
  }
}

// How nearly parallel a capsule's axis and the contact direction have to be before the capsule counts
// as presenting a cap rather than its side. cos(20 degrees): past that the segment's two points are
// close enough together that clipping them adds nothing a single point does not already say.
const CAPSULE_AXIS_ALIGNMENT_LIMIT = 0.94;
const FACE_EPSILON = 1e-12;
// How far below the maximum projection a vertex may sit and still count as on the supporting face.
// Absolute rather than relative to the hull's size: a collider hull is authored in world units near
// unit scale, and a relative band would widen with distance from the origin — admitting vertices from
// the far side of a hull that merely sits far from the world centre.
const FACE_PLANE_TOLERANCE = 1e-6;
const MAX_FACE_VERTICES = 16;

const IDENTITY_ROTATION = [0, 0, 0, 1];
const collisionFaceQueries3D = new Map<CollisionShapeKind3D, CollisionFaceQuery3D>();
const faceAngles = new Float64Array(MAX_FACE_VERTICES);
const localFaceCorner = [0, 0, 0];
const localFaceDirection = [0, 0, 0];
const planeAxisU = [0, 0, 0];
const planeAxisV = [0, 0, 0];
const rotatedCorner = [0, 0, 0];
const rotation = [0, 0, 0, 1];
