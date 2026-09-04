import { writeCollisionHeightfieldBounds3D, writeCollisionTriangleMeshBounds3D } from '@flighthq/collision/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CollisionColliderShape3D,
  Entity,
  Physics3DCollider,
  RigidBody3D,
  SpatialAabb3D,
} from '@flighthq/types/contract';

// Allocates the world-space shape a collider needs for `local`, choosing the kind the transform can
// actually express. Every field is filled at creation so the shape is never read half-initialised, and
// convex-hull storage is sized once here so the per-step transform can write in place.
export function createPhysics3DColliderWorldShape(
  local: Readonly<CollisionColliderShape3D>,
): CollisionColliderShape3D & Entity {
  switch (local.kind) {
    case 'sphere':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'sphere';
      out.x = local.x;
      out.y = local.y;
      out.z = local.z;
      out.radius = local.radius;
      return finishEntity(out);
    case 'aabb':
    case 'box':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'box';
      out.x = 0;
      out.y = 0;
      out.z = 0;
      out.halfX = 0;
      out.halfY = 0;
      out.halfZ = 0;
      out.rotationX = 0;
      out.rotationY = 0;
      out.rotationZ = 0;
      out.rotationW = 1;
      return finishEntity(out);
    case 'capsule':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'capsule';
      out.x0 = local.x0;
      out.y0 = local.y0;
      out.z0 = local.z0;
      out.x1 = local.x1;
      out.y1 = local.y1;
      out.z1 = local.z1;
      out.radius = local.radius;
      return finishEntity(out);
    case 'cylinder':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'cylinder';
      out.x0 = local.x0;
      out.y0 = local.y0;
      out.z0 = local.z0;
      out.x1 = local.x1;
      out.y1 = local.y1;
      out.z1 = local.z1;
      out.radius = local.radius;
      return finishEntity(out);
    case 'cone':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'cone';
      out.apexX = local.apexX;
      out.apexY = local.apexY;
      out.apexZ = local.apexZ;
      out.baseX = local.baseX;
      out.baseY = local.baseY;
      out.baseZ = local.baseZ;
      out.radius = local.radius;
      return finishEntity(out);
    case 'convex':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'convex';
      out.points = local.points.slice();
      return finishEntity(out);
    case 'triangle-mesh':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'triangle-mesh';
      out.points = local.points;
      out.indices = local.indices;
      out.version = local.version;
      out.x = local.x;
      out.y = local.y;
      out.z = local.z;
      out.rotationX = local.rotationX;
      out.rotationY = local.rotationY;
      out.rotationZ = local.rotationZ;
      out.rotationW = local.rotationW;
      return finishEntity(out);
    case 'heightfield':
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'heightfield';
      out.columns = local.columns;
      out.rows = local.rows;
      out.heights = local.heights;
      out.cellSizeX = local.cellSizeX;
      out.cellSizeZ = local.cellSizeZ;
      out.version = local.version;
      out.x = local.x;
      out.y = local.y;
      out.z = local.z;
      out.rotationX = local.rotationX;
      out.rotationY = local.rotationY;
      out.rotationZ = local.rotationZ;
      out.rotationW = local.rotationW;
      return finishEntity(out);
    default:
            const out = allocateEntity<Physics3DColliderWorldShape>();
      out.kind = 'sphere';
      out.x = 0;
      out.y = 0;
      out.z = 0;
      out.radius = 0;
      return finishEntity(out);
  }
}

// Rewrites `collider.world` from its local shape and the body's current pose. Called once per collider
// per step, before the narrow phase — never per contact test, because a body with four colliders against
// a hundred broadphase candidates would otherwise transform the same shape a hundred times to produce
// the same answer.
//
// The world shape is preallocated at collider creation and mutated in place, so a step allocates
// nothing. Hull points are the only variable-length part, and the world array is sized once from the
// local one; `invalidatePhysics3DCollider` replaces that storage after an authored shape changes.
export function updatePhysics3DColliderWorldShape(collider: Physics3DCollider, body: Readonly<RigidBody3D>): void {
  const local = collider.local;
  const world = collider.world;
  const qX = body.orientationX;
  const qY = body.orientationY;
  const qZ = body.orientationZ;
  const qW = body.orientationW;

  if (local.kind === 'sphere' && world.kind === 'sphere') {
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x, local.y, local.z, scratchPoint);
    world.x = body.x + scratchPoint[0];
    world.y = body.y + scratchPoint[1];
    world.z = body.z + scratchPoint[2];
    world.radius = local.radius;
    return;
  }

  // An axis-aligned box promotes to an ORIENTED box in world space: rotate it and it is no longer
  // axis-aligned, and silently keeping the `aabb` kind would grow the box to its bounding extent the
  // first time the body turned.
  if (local.kind === 'aabb' && world.kind === 'box') {
    const centerX = (local.minX + local.maxX) / 2;
    const centerY = (local.minY + local.maxY) / 2;
    const centerZ = (local.minZ + local.maxZ) / 2;
    rotatePhysics3DPoint(qX, qY, qZ, qW, centerX, centerY, centerZ, scratchPoint);
    world.x = body.x + scratchPoint[0];
    world.y = body.y + scratchPoint[1];
    world.z = body.z + scratchPoint[2];
    world.halfX = (local.maxX - local.minX) / 2;
    world.halfY = (local.maxY - local.minY) / 2;
    world.halfZ = (local.maxZ - local.minZ) / 2;
    world.rotationX = qX;
    world.rotationY = qY;
    world.rotationZ = qZ;
    world.rotationW = qW;
    return;
  }

  if (local.kind === 'box' && world.kind === 'box') {
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x, local.y, local.z, scratchPoint);
    world.x = body.x + scratchPoint[0];
    world.y = body.y + scratchPoint[1];
    world.z = body.z + scratchPoint[2];
    world.halfX = local.halfX;
    world.halfY = local.halfY;
    world.halfZ = local.halfZ;
    // Quaternion composition, body THEN local — the order a local rotation is applied first and the
    // body's on top of it. Reversing the operands is the classic silent error: it produces a valid unit
    // quaternion describing the wrong orientation, so nothing is non-finite and nothing throws.
    world.rotationX = qW * local.rotationX + qX * local.rotationW + qY * local.rotationZ - qZ * local.rotationY;
    world.rotationY = qW * local.rotationY - qX * local.rotationZ + qY * local.rotationW + qZ * local.rotationX;
    world.rotationZ = qW * local.rotationZ + qX * local.rotationY - qY * local.rotationX + qZ * local.rotationW;
    world.rotationW = qW * local.rotationW - qX * local.rotationX - qY * local.rotationY - qZ * local.rotationZ;
    return;
  }

  if (local.kind === 'capsule' && world.kind === 'capsule') {
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x0, local.y0, local.z0, scratchPoint);
    world.x0 = body.x + scratchPoint[0];
    world.y0 = body.y + scratchPoint[1];
    world.z0 = body.z + scratchPoint[2];
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x1, local.y1, local.z1, scratchPoint);
    world.x1 = body.x + scratchPoint[0];
    world.y1 = body.y + scratchPoint[1];
    world.z1 = body.z + scratchPoint[2];
    world.radius = local.radius;
    return;
  }

  if (local.kind === 'cylinder' && world.kind === 'cylinder') {
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x0, local.y0, local.z0, scratchPoint);
    world.x0 = body.x + scratchPoint[0];
    world.y0 = body.y + scratchPoint[1];
    world.z0 = body.z + scratchPoint[2];
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.x1, local.y1, local.z1, scratchPoint);
    world.x1 = body.x + scratchPoint[0];
    world.y1 = body.y + scratchPoint[1];
    world.z1 = body.z + scratchPoint[2];
    world.radius = local.radius;
    return;
  }

  if (local.kind === 'cone' && world.kind === 'cone') {
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.apexX, local.apexY, local.apexZ, scratchPoint);
    world.apexX = body.x + scratchPoint[0];
    world.apexY = body.y + scratchPoint[1];
    world.apexZ = body.z + scratchPoint[2];
    rotatePhysics3DPoint(qX, qY, qZ, qW, local.baseX, local.baseY, local.baseZ, scratchPoint);
    world.baseX = body.x + scratchPoint[0];
    world.baseY = body.y + scratchPoint[1];
    world.baseZ = body.z + scratchPoint[2];
    world.radius = local.radius;
    return;
  }

  if (local.kind === 'convex' && world.kind === 'convex') {
    const source = local.points;
    const target = world.points;
    for (let i = 0; i + 2 < source.length; i += 3) {
      rotatePhysics3DPoint(qX, qY, qZ, qW, source[i], source[i + 1], source[i + 2], scratchPoint);
      target[i] = body.x + scratchPoint[0];
      target[i + 1] = body.y + scratchPoint[1];
      target[i + 2] = body.z + scratchPoint[2];
    }
    return;
  }

  if (local.kind === 'triangle-mesh' && world.kind === 'triangle-mesh') {
    updatePhysics3DStaticSurfacePose(local, world, body);
    world.points = local.points;
    world.indices = local.indices;
    world.version = local.version;
    return;
  }

  if (local.kind === 'heightfield' && world.kind === 'heightfield') {
    updatePhysics3DStaticSurfacePose(local, world, body);
    world.columns = local.columns;
    world.rows = local.rows;
    world.heights = local.heights;
    world.cellSizeX = local.cellSizeX;
    world.cellSizeZ = local.cellSizeZ;
    world.version = local.version;
  }
}

// Writes `collider.world`'s axis-aligned bounds into `out` — the broadphase's view of the collider.
// Bounds are computed from the WORLD shape rather than by transforming local bounds, because rotating
// an extent and rotating a shape's bounds are different boxes: the second is the bound of the first and
// grows without limit as the body spins.
export function writePhysics3DColliderBounds(collider: Readonly<Physics3DCollider>, out: SpatialAabb3D): void {
  const shape = collider.world;
  switch (shape.kind) {
    case 'sphere':
      out.minX = shape.x - shape.radius;
      out.minY = shape.y - shape.radius;
      out.minZ = shape.z - shape.radius;
      out.maxX = shape.x + shape.radius;
      out.maxY = shape.y + shape.radius;
      out.maxZ = shape.z + shape.radius;
      return;
    case 'aabb':
      out.minX = shape.minX;
      out.minY = shape.minY;
      out.minZ = shape.minZ;
      out.maxX = shape.maxX;
      out.maxY = shape.maxY;
      out.maxZ = shape.maxZ;
      return;
    case 'box': {
      // The support of a rotated box along each world axis: the absolute row of its rotation matrix
      // dotted with the half extents. Taking absolute values is what makes this the extent of the
      // rotated box rather than of one particular corner.
      const x = shape.rotationX;
      const y = shape.rotationY;
      const z = shape.rotationZ;
      const w = shape.rotationW;
      const m00 = Math.abs(1 - 2 * (y * y + z * z));
      const m01 = Math.abs(2 * (x * y - w * z));
      const m02 = Math.abs(2 * (x * z + w * y));
      const m10 = Math.abs(2 * (x * y + w * z));
      const m11 = Math.abs(1 - 2 * (x * x + z * z));
      const m12 = Math.abs(2 * (y * z - w * x));
      const m20 = Math.abs(2 * (x * z - w * y));
      const m21 = Math.abs(2 * (y * z + w * x));
      const m22 = Math.abs(1 - 2 * (x * x + y * y));
      const extentX = m00 * shape.halfX + m01 * shape.halfY + m02 * shape.halfZ;
      const extentY = m10 * shape.halfX + m11 * shape.halfY + m12 * shape.halfZ;
      const extentZ = m20 * shape.halfX + m21 * shape.halfY + m22 * shape.halfZ;
      out.minX = shape.x - extentX;
      out.minY = shape.y - extentY;
      out.minZ = shape.z - extentZ;
      out.maxX = shape.x + extentX;
      out.maxY = shape.y + extentY;
      out.maxZ = shape.z + extentZ;
      return;
    }
    case 'capsule':
      out.minX = Math.min(shape.x0, shape.x1) - shape.radius;
      out.minY = Math.min(shape.y0, shape.y1) - shape.radius;
      out.minZ = Math.min(shape.z0, shape.z1) - shape.radius;
      out.maxX = Math.max(shape.x0, shape.x1) + shape.radius;
      out.maxY = Math.max(shape.y0, shape.y1) + shape.radius;
      out.maxZ = Math.max(shape.z0, shape.z1) + shape.radius;
      return;
    case 'cylinder': {
      // A cylinder's cap is a DISC, not a sphere, so its extent along each axis is `radius` reduced by
      // how much the axis lies along the cylinder's own. Padding by the full radius the way the capsule
      // above does is valid but loose — an axis-aligned cylinder would claim a bounding box a full
      // radius too tall, and every extra unit is broadphase pairs the narrow phase then has to reject.
      writeDiscExtent(shape.x1 - shape.x0, shape.y1 - shape.y0, shape.z1 - shape.z0, shape.radius, scratchExtent);
      out.minX = Math.min(shape.x0, shape.x1) - scratchExtent[0];
      out.minY = Math.min(shape.y0, shape.y1) - scratchExtent[1];
      out.minZ = Math.min(shape.z0, shape.z1) - scratchExtent[2];
      out.maxX = Math.max(shape.x0, shape.x1) + scratchExtent[0];
      out.maxY = Math.max(shape.y0, shape.y1) + scratchExtent[1];
      out.maxZ = Math.max(shape.z0, shape.z1) + scratchExtent[2];
      return;
    }
    case 'cone': {
      // The union of a point and a disc: the apex contributes no extent at all, so padding it the way
      // the base is padded would describe a cylinder rather than a cone.
      writeDiscExtent(
        shape.baseX - shape.apexX,
        shape.baseY - shape.apexY,
        shape.baseZ - shape.apexZ,
        shape.radius,
        scratchExtent,
      );
      out.minX = Math.min(shape.apexX, shape.baseX - scratchExtent[0]);
      out.minY = Math.min(shape.apexY, shape.baseY - scratchExtent[1]);
      out.minZ = Math.min(shape.apexZ, shape.baseZ - scratchExtent[2]);
      out.maxX = Math.max(shape.apexX, shape.baseX + scratchExtent[0]);
      out.maxY = Math.max(shape.apexY, shape.baseY + scratchExtent[1]);
      out.maxZ = Math.max(shape.apexZ, shape.baseZ + scratchExtent[2]);
      return;
    }
    case 'convex': {
      const points = shape.points;
      if (points.length < 3) {
        out.minX = 0;
        out.minY = 0;
        out.minZ = 0;
        out.maxX = 0;
        out.maxY = 0;
        out.maxZ = 0;
        return;
      }
      let minX = points[0];
      let minY = points[1];
      let minZ = points[2];
      let maxX = minX;
      let maxY = minY;
      let maxZ = minZ;
      for (let i = 3; i + 2 < points.length; i += 3) {
        const x = points[i];
        const y = points[i + 1];
        const z = points[i + 2];
        if (x < minX) minX = x;
        else if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        else if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        else if (z > maxZ) maxZ = z;
      }
      out.minX = minX;
      out.minY = minY;
      out.minZ = minZ;
      out.maxX = maxX;
      out.maxY = maxY;
      out.maxZ = maxZ;
      return;
    }
    case 'triangle-mesh':
      writeCollisionTriangleMeshBounds3D(shape, out);
      return;
    case 'heightfield':
      writeCollisionHeightfieldBounds3D(shape, out);
      return;
    default:
      out.minX = 0;
      out.minY = 0;
      out.minZ = 0;
      out.maxX = 0;
      out.maxY = 0;
      out.maxZ = 0;
  }
}

function updatePhysics3DStaticSurfacePose(
  local: Readonly<Extract<CollisionColliderShape3D, { kind: 'triangle-mesh' | 'heightfield' }>>,
  world: Extract<CollisionColliderShape3D, { kind: 'triangle-mesh' | 'heightfield' }>,
  body: Readonly<RigidBody3D>,
): void {
  rotatePhysics3DPoint(
    body.orientationX,
    body.orientationY,
    body.orientationZ,
    body.orientationW,
    local.x,
    local.y,
    local.z,
    scratchPoint,
  );
  world.x = body.x + scratchPoint[0];
  world.y = body.y + scratchPoint[1];
  world.z = body.z + scratchPoint[2];
  world.rotationX =
    body.orientationW * local.rotationX +
    body.orientationX * local.rotationW +
    body.orientationY * local.rotationZ -
    body.orientationZ * local.rotationY;
  world.rotationY =
    body.orientationW * local.rotationY -
    body.orientationX * local.rotationZ +
    body.orientationY * local.rotationW +
    body.orientationZ * local.rotationX;
  world.rotationZ =
    body.orientationW * local.rotationZ +
    body.orientationX * local.rotationY -
    body.orientationY * local.rotationX +
    body.orientationZ * local.rotationW;
  world.rotationW =
    body.orientationW * local.rotationW -
    body.orientationX * local.rotationX -
    body.orientationY * local.rotationY -
    body.orientationZ * local.rotationZ;
}

// Rotates (`x`,`y`,`z`) by the unit quaternion, writing three components into `out`. The two-cross-product
// form rather than a matrix build: this runs per point of every hull of every collider every step, and
// materialising nine matrix entries to use them once is the more expensive of the two.
function rotatePhysics3DPoint(
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

// The per-axis half-extent of a disc of `radius` whose plane normal is `axis`, written as `[x, y, z]`.
//
// A disc reaches its full radius along an axis only when that axis lies IN its plane; along its own
// normal it reaches nothing. `sqrt(1 - component^2)` is exactly that falloff, with `component` the
// direction cosine between the world axis and the disc's normal. A degenerate (zero) axis has no plane,
// so the full radius is returned on every axis — the conservative answer, matching what validation
// would have rejected anyway.
function writeDiscExtent(axisX: number, axisY: number, axisZ: number, radius: number, out: number[]): void {
  const lengthSquared = axisX * axisX + axisY * axisY + axisZ * axisZ;
  if (lengthSquared <= 0) {
    out[0] = radius;
    out[1] = radius;
    out[2] = radius;
    return;
  }
  const inverse = 1 / Math.sqrt(lengthSquared);
  const nx = axisX * inverse;
  const ny = axisY * inverse;
  const nz = axisZ * inverse;
  // Clamped at zero because 1 - n^2 can land a few ulps below it when the axis is exactly cardinal, and
  // Math.sqrt of a negative would put NaN into a broadphase bound.
  out[0] = radius * Math.sqrt(Math.max(0, 1 - nx * nx));
  out[1] = radius * Math.sqrt(Math.max(0, 1 - ny * ny));
  out[2] = radius * Math.sqrt(Math.max(0, 1 - nz * nz));
}

const scratchExtent = [0, 0, 0];
const scratchPoint = [0, 0, 0];
