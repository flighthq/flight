import type { CollisionBuiltInShape3D, CollisionRaycastHit3D } from '@flighthq/types/contract';

import { writeCollisionConvexHullFaces3D } from './convexHull3D';
import { getCollisionShapeContainsPoint3D } from './pointContainment3D';

export function createCollisionRaycastHit3D(): CollisionRaycastHit3D {
  return { fraction: 0, x: 0, y: 0, z: 0, normalX: 0, normalY: 0, normalZ: 0 };
}

// Writes the first exact intersection of `origin + direction * fraction` with `shape`. Direction need
// not be normalized; fraction therefore stays in the caller's parameterization. `maxFraction` bounds a
// segment or sweep without changing the ray direction, and defaults to an unbounded forward ray.
//
// An origin already INSIDE the shape is a hit at fraction 0 with a zero normal, matching
// `raycastCollisionShape2D`: no outward-facing side was crossed, so there is no surface normal to
// report, and a caller picking with a point inside a solid still gets that solid.
//
// A convex hull is clipped against the face planes of a triangulation derived on the spot, so it costs
// more per call than the four closed-form kinds. A caller raycasting the same hull every frame is paying
// that build every frame; the closed forms are the cheap path.
export function raycastCollisionShape3D(
  shape: Readonly<CollisionBuiltInShape3D>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction = Number.POSITIVE_INFINITY,
): boolean {
  clearRaycastHit3D(out);
  if (
    !Number.isFinite(originX) ||
    !Number.isFinite(originY) ||
    !Number.isFinite(originZ) ||
    !Number.isFinite(directionX) ||
    !Number.isFinite(directionY) ||
    !Number.isFinite(directionZ) ||
    Number.isNaN(maxFraction) ||
    maxFraction < 0
  ) {
    return false;
  }
  if (getCollisionShapeContainsPoint3D(shape, originX, originY, originZ)) {
    out.x = originX;
    out.y = originY;
    out.z = originZ;
    return true;
  }
  if (!(directionX * directionX + directionY * directionY + directionZ * directionZ > 0)) return false;

  switch (shape.kind) {
    case 'sphere':
      return raycastSphere3D(
        shape.x,
        shape.y,
        shape.z,
        shape.radius,
        originX,
        originY,
        originZ,
        directionX,
        directionY,
        directionZ,
        out,
        maxFraction,
      );
    case 'aabb':
      return raycastSlabs3D(
        originX - (shape.minX + shape.maxX) / 2,
        originY - (shape.minY + shape.maxY) / 2,
        originZ - (shape.minZ + shape.maxZ) / 2,
        directionX,
        directionY,
        directionZ,
        (shape.maxX - shape.minX) / 2,
        (shape.maxY - shape.minY) / 2,
        (shape.maxZ - shape.minZ) / 2,
        maxFraction,
        scratchSlab,
      )
        ? writeRaycastHit3D(
            out,
            originX,
            originY,
            originZ,
            directionX,
            directionY,
            directionZ,
            scratchSlab.fraction,
            scratchSlab.normalX,
            scratchSlab.normalY,
            scratchSlab.normalZ,
          )
        : false;
    case 'box':
      return raycastBox3D(shape, originX, originY, originZ, directionX, directionY, directionZ, out, maxFraction);
    case 'capsule':
      return raycastCapsule3D(shape, originX, originY, originZ, directionX, directionY, directionZ, out, maxFraction);
    case 'convex':
      return raycastConvexHull3D(
        shape.points,
        originX,
        originY,
        originZ,
        directionX,
        directionY,
        directionZ,
        out,
        maxFraction,
      );
    default:
      return false;
  }
}

// Ray against a convex hull, by clipping the ray against every face plane of its own triangulation.
//
// A convex solid is the intersection of the half-spaces behind its faces, so the entry parameter is the
// LARGEST of the per-plane entry parameters and the exit is the SMALLEST of the exits — the same slab
// logic the box uses, generalised from three axis-aligned pairs to one plane per face. The hull misses
// exactly when entry passes exit.
//
// The triangulation is derived here rather than carried on the shape, because `CollisionConvex3D` is a
// bare point list by design: a stored face set is a second source of truth that can disagree with the
// points it was built from.
function raycastConvexHull3D(
  points: readonly number[],
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction: number,
): boolean {
  const triangleCount = writeCollisionConvexHullFaces3D(points, scratchHullFaces);
  if (triangleCount === 0) return false;

  let near = 0;
  let far = maxFraction;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  let entered = false;

  for (let f = 0; f < triangleCount; f += 1) {
    const a = scratchHullFaces[f * 3] * 3;
    const b = scratchHullFaces[f * 3 + 1] * 3;
    const c = scratchHullFaces[f * 3 + 2] * 3;
    const aX = points[a];
    const aY = points[a + 1];
    const aZ = points[a + 2];
    const e1X = points[b] - aX;
    const e1Y = points[b + 1] - aY;
    const e1Z = points[b + 2] - aZ;
    const e2X = points[c] - aX;
    const e2Y = points[c + 1] - aY;
    const e2Z = points[c + 2] - aZ;
    // Outward by construction: the triangulation winds every face away from the interior.
    const planeX = e1Y * e2Z - e1Z * e2Y;
    const planeY = e1Z * e2X - e1X * e2Z;
    const planeZ = e1X * e2Y - e1Y * e2X;

    const denominator = directionX * planeX + directionY * planeY + directionZ * planeZ;
    const distance = (originX - aX) * planeX + (originY - aY) * planeY + (originZ - aZ) * planeZ;

    if (denominator === 0) {
      // Parallel to this face. Outside its plane means outside the solid, whatever the other faces say.
      if (distance > 0) return false;
      continue;
    }

    const fraction = -distance / denominator;
    if (denominator < 0) {
      // Approaching this face from outside: it is an entry plane.
      if (fraction > near) {
        near = fraction;
        normalX = planeX;
        normalY = planeY;
        normalZ = planeZ;
        entered = true;
      }
    } else if (fraction < far) {
      far = fraction;
    }
    if (near > far) return false;
  }

  if (!entered || near > maxFraction) return false;

  const length = Math.sqrt(normalX * normalX + normalY * normalY + normalZ * normalZ);
  if (!(length > 0)) return false;
  return writeRaycastHit3D(
    out,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    near,
    normalX / length,
    normalY / length,
    normalZ / length,
  );
}

// Ray against an oriented box, by moving the RAY into the box's frame rather than the box into the
// world's. One conjugate rotation of two vectors replaces rotating eight corners, and the slab test then
// runs on an axis-aligned problem; only the resulting normal rotates back.
function raycastBox3D(
  shape: Readonly<CollisionBuiltInShape3D & { kind: 'box' }>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction: number,
): boolean {
  const qX = -shape.rotationX;
  const qY = -shape.rotationY;
  const qZ = -shape.rotationZ;
  const qW = shape.rotationW;
  rotateVector3D(qX, qY, qZ, qW, originX - shape.x, originY - shape.y, originZ - shape.z, scratchLocalOrigin);
  rotateVector3D(qX, qY, qZ, qW, directionX, directionY, directionZ, scratchLocalDirection);

  if (
    !raycastSlabs3D(
      scratchLocalOrigin[0],
      scratchLocalOrigin[1],
      scratchLocalOrigin[2],
      scratchLocalDirection[0],
      scratchLocalDirection[1],
      scratchLocalDirection[2],
      shape.halfX,
      shape.halfY,
      shape.halfZ,
      maxFraction,
      scratchSlab,
    )
  ) {
    return false;
  }

  // The normal came out in the box's frame, so it rotates back by the ORIGINAL orientation. The
  // fraction does not: it is a parameter along the ray, and rotating a ray does not reparameterize it.
  rotateVector3D(
    shape.rotationX,
    shape.rotationY,
    shape.rotationZ,
    shape.rotationW,
    scratchSlab.normalX,
    scratchSlab.normalY,
    scratchSlab.normalZ,
    scratchWorldNormal,
  );
  return writeRaycastHit3D(
    out,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    scratchSlab.fraction,
    scratchWorldNormal[0],
    scratchWorldNormal[1],
    scratchWorldNormal[2],
  );
}

// Ray against a capsule, as the nearest of three independent intersections: the two end spheres and the
// side of the finite cylinder between them.
//
// Decomposed rather than fused into one quadratic on purpose. The fused form is shorter and is the
// classic source of a capsule whose caps are subtly wrong, because the axial-range test and the root
// selection interact; here each piece is separately checkable and the only shared step is taking a
// minimum.
function raycastCapsule3D(
  shape: Readonly<CollisionBuiltInShape3D & { kind: 'capsule' }>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction: number,
): boolean {
  let best = Number.POSITIVE_INFINITY;
  let bestNormalX = 0;
  let bestNormalY = 0;
  let bestNormalZ = 0;

  const axisX = shape.x1 - shape.x0;
  const axisY = shape.y1 - shape.y0;
  const axisZ = shape.z1 - shape.z0;
  const axisLengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;

  for (let end = 0; end < 2; end += 1) {
    const centerX = end === 0 ? shape.x0 : shape.x1;
    const centerY = end === 0 ? shape.y0 : shape.y1;
    const centerZ = end === 0 ? shape.z0 : shape.z1;
    if (
      raycastSphere3D(
        centerX,
        centerY,
        centerZ,
        shape.radius,
        originX,
        originY,
        originZ,
        directionX,
        directionY,
        directionZ,
        scratchCapHit,
        maxFraction,
      ) &&
      scratchCapHit.fraction < best
    ) {
      best = scratchCapHit.fraction;
      bestNormalX = scratchCapHit.normalX;
      bestNormalY = scratchCapHit.normalY;
      bestNormalZ = scratchCapHit.normalZ;
    }
    if (axisLengthSquared === 0) break;
  }

  if (axisLengthSquared > 0) {
    // The side of the cylinder: the same circle equation as a sphere's, with every axial component
    // projected out of both the ray and the offset first.
    const inverseLength = 1 / Math.sqrt(axisLengthSquared);
    const uX = axisX * inverseLength;
    const uY = axisY * inverseLength;
    const uZ = axisZ * inverseLength;

    const offsetX = originX - shape.x0;
    const offsetY = originY - shape.y0;
    const offsetZ = originZ - shape.z0;
    const offsetAxial = offsetX * uX + offsetY * uY + offsetZ * uZ;
    const perpendicularOriginX = offsetX - uX * offsetAxial;
    const perpendicularOriginY = offsetY - uY * offsetAxial;
    const perpendicularOriginZ = offsetZ - uZ * offsetAxial;

    const directionAxial = directionX * uX + directionY * uY + directionZ * uZ;
    const perpendicularDirectionX = directionX - uX * directionAxial;
    const perpendicularDirectionY = directionY - uY * directionAxial;
    const perpendicularDirectionZ = directionZ - uZ * directionAxial;

    const a =
      perpendicularDirectionX * perpendicularDirectionX +
      perpendicularDirectionY * perpendicularDirectionY +
      perpendicularDirectionZ * perpendicularDirectionZ;
    if (a > 0) {
      const b =
        2 *
        (perpendicularOriginX * perpendicularDirectionX +
          perpendicularOriginY * perpendicularDirectionY +
          perpendicularOriginZ * perpendicularDirectionZ);
      const c =
        perpendicularOriginX * perpendicularOriginX +
        perpendicularOriginY * perpendicularOriginY +
        perpendicularOriginZ * perpendicularOriginZ -
        shape.radius * shape.radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        for (const fraction of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
          if (fraction < 0 || fraction > maxFraction || fraction >= best) continue;
          // Accept only where the hit lies BETWEEN the two ends. Beyond either, the surface reached is
          // the cap, which the sphere pass above already covered.
          const hitX = originX + directionX * fraction;
          const hitY = originY + directionY * fraction;
          const hitZ = originZ + directionZ * fraction;
          const axial = (hitX - shape.x0) * uX + (hitY - shape.y0) * uY + (hitZ - shape.z0) * uZ;
          if (axial < 0 || axial * inverseLength > 1) continue;
          best = fraction;
          bestNormalX = (hitX - (shape.x0 + uX * axial)) / shape.radius;
          bestNormalY = (hitY - (shape.y0 + uY * axial)) / shape.radius;
          bestNormalZ = (hitZ - (shape.z0 + uZ * axial)) / shape.radius;
          break;
        }
      }
    }
  }

  if (best === Number.POSITIVE_INFINITY) return false;
  return writeRaycastHit3D(
    out,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    best,
    bestNormalX,
    bestNormalY,
    bestNormalZ,
  );
}

// Ray against the axis-aligned box of the given half extents centred on the ORIGIN, with the ray already
// expressed relative to that centre. Shared by the `aabb` kind and by the oriented box's local-frame
// solve, which is why it takes a centred problem rather than a shape.
function raycastSlabs3D(
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  maxFraction: number,
  out: SlabHit,
): boolean {
  let near = 0;
  let far = maxFraction;
  let axis = -1;
  let sign = 0;

  for (let i = 0; i < 3; i += 1) {
    const origin = i === 0 ? originX : i === 1 ? originY : originZ;
    const direction = i === 0 ? directionX : i === 1 ? directionY : directionZ;
    const half = i === 0 ? halfX : i === 1 ? halfY : halfZ;

    if (direction === 0) {
      // Parallel to this slab: the ray never crosses either of its planes, so it either stays inside
      // the slab for its whole length or misses the box outright.
      if (origin < -half || origin > half) return false;
      continue;
    }

    const inverse = 1 / direction;
    let entry = (-half - origin) * inverse;
    let exit = (half - origin) * inverse;
    let entrySign = -1;
    if (entry > exit) {
      const swap = entry;
      entry = exit;
      exit = swap;
      entrySign = 1;
    }
    if (entry > near) {
      near = entry;
      axis = i;
      sign = entrySign;
    }
    if (exit < far) far = exit;
    if (near > far) return false;
  }

  if (axis < 0) return false;
  out.fraction = near;
  out.normalX = axis === 0 ? sign : 0;
  out.normalY = axis === 1 ? sign : 0;
  out.normalZ = axis === 2 ? sign : 0;
  return true;
}

function raycastSphere3D(
  centerX: number,
  centerY: number,
  centerZ: number,
  radius: number,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction: number,
): boolean {
  const offsetX = originX - centerX;
  const offsetY = originY - centerY;
  const offsetZ = originZ - centerZ;
  const a = directionX * directionX + directionY * directionY + directionZ * directionZ;
  const b = 2 * (offsetX * directionX + offsetY * directionY + offsetZ * directionZ);
  const c = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;

  const root = Math.sqrt(discriminant);
  let fraction = (-b - root) / (2 * a);
  if (fraction < 0) fraction = (-b + root) / (2 * a);
  if (fraction < 0 || fraction > maxFraction) return false;

  const hitX = originX + directionX * fraction;
  const hitY = originY + directionY * fraction;
  const hitZ = originZ + directionZ * fraction;
  return writeRaycastHit3D(
    out,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    fraction,
    (hitX - centerX) / radius,
    (hitY - centerY) / radius,
    (hitZ - centerZ) / radius,
  );
}

function clearRaycastHit3D(out: CollisionRaycastHit3D): void {
  out.fraction = 0;
  out.x = 0;
  out.y = 0;
  out.z = 0;
  out.normalX = 0;
  out.normalY = 0;
  out.normalZ = 0;
}

function rotateVector3D(
  qX: number,
  qY: number,
  qZ: number,
  qW: number,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  const tX = 2 * (qY * z - qZ * y);
  const tY = 2 * (qZ * x - qX * z);
  const tZ = 2 * (qX * y - qY * x);
  out[0] = x + qW * tX + qY * tZ - qZ * tY;
  out[1] = y + qW * tY + qZ * tX - qX * tZ;
  out[2] = z + qW * tZ + qX * tY - qY * tX;
}

// Returns true so the callers above can `return writeRaycastHit3D(...)` rather than write then return.
function writeRaycastHit3D(
  out: CollisionRaycastHit3D,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  fraction: number,
  normalX: number,
  normalY: number,
  normalZ: number,
): boolean {
  out.fraction = fraction;
  out.x = originX + directionX * fraction;
  out.y = originY + directionY * fraction;
  out.z = originZ + directionZ * fraction;
  out.normalX = normalX;
  out.normalY = normalY;
  out.normalZ = normalZ;
  return true;
}

interface SlabHit {
  fraction: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

const scratchHullFaces: number[] = [];

const scratchSlab: SlabHit = { fraction: 0, normalX: 0, normalY: 0, normalZ: 0 };

const scratchCapHit = createCollisionRaycastHit3D();

const scratchLocalOrigin = [0, 0, 0];

const scratchLocalDirection = [0, 0, 0];

const scratchWorldNormal = [0, 0, 0];
