import type { Physics3DCollider, Physics3DMassData, RigidBody3D } from '@flighthq/types/contract';

import {
  inverseSymmetricTensor,
  translateSymmetricTensor,
  TENSOR_XX,
  TENSOR_XY,
  TENSOR_XZ,
  TENSOR_YY,
  TENSOR_YZ,
  TENSOR_ZZ,
} from './symmetricTensor';

// Mass properties for 3D primitives, and the combination of several into one body's.
//
// Mass is derived from geometry and density rather than set directly, so a body's inertia can never
// disagree with its shape. The primitives here are the ones whose inertia has a closed form; a convex
// hull's and a triangle mesh's are volume integrals over a triangulation, which a bare point list does
// not carry — see `computePhysics3DColliderMassData` for what a hull collider does instead.
//
// Every tensor produced here is about the primitive's OWN centre, in the frame the primitive is
// described in. `combinePhysics3DMassData` is what shifts them onto a shared centre.

// Accumulates `addend` into `target`, shifting both tensors onto their combined centre of mass by the
// parallel-axis theorem. `target` is left holding the combined mass, centre, and inertia.
//
// This is how a body made of several primitives gets one tensor. Note that both sides move: the
// combined centre is somewhere between them, so the tensor already in `target` is shifted too. A
// version that only shifted the addend would be correct for the first primitive and wrong for every
// one after it, in a way that looks right until a body is built from two halves and swings about the
// wrong point.
export function combinePhysics3DMassData(target: Physics3DMassData, addend: Readonly<Physics3DMassData>): void {
  const totalMass = target.mass + addend.mass;
  if (totalMass <= 0) {
    target.mass = 0;
    target.inertiaXX = 0;
    target.inertiaYY = 0;
    target.inertiaZZ = 0;
    target.inertiaXY = 0;
    target.inertiaXZ = 0;
    target.inertiaYZ = 0;
    return;
  }

  const inverseTotal = 1 / totalMass;
  const centerX = (target.centerX * target.mass + addend.centerX * addend.mass) * inverseTotal;
  const centerY = (target.centerY * target.mass + addend.centerY * addend.mass) * inverseTotal;
  const centerZ = (target.centerZ * target.mass + addend.centerZ * addend.mass) * inverseTotal;

  readTensor(target, scratchTensorA);
  translateSymmetricTensor(
    scratchTensorA,
    target.mass,
    target.centerX - centerX,
    target.centerY - centerY,
    target.centerZ - centerZ,
    scratchTensorA,
  );

  readTensor(addend, scratchTensorB);
  translateSymmetricTensor(
    scratchTensorB,
    addend.mass,
    addend.centerX - centerX,
    addend.centerY - centerY,
    addend.centerZ - centerZ,
    scratchTensorB,
  );

  target.mass = totalMass;
  target.centerX = centerX;
  target.centerY = centerY;
  target.centerZ = centerZ;
  target.inertiaXX = scratchTensorA[TENSOR_XX] + scratchTensorB[TENSOR_XX];
  target.inertiaYY = scratchTensorA[TENSOR_YY] + scratchTensorB[TENSOR_YY];
  target.inertiaZZ = scratchTensorA[TENSOR_ZZ] + scratchTensorB[TENSOR_ZZ];
  target.inertiaXY = scratchTensorA[TENSOR_XY] + scratchTensorB[TENSOR_XY];
  target.inertiaXZ = scratchTensorA[TENSOR_XZ] + scratchTensorB[TENSOR_XZ];
  target.inertiaYZ = scratchTensorA[TENSOR_YZ] + scratchTensorB[TENSOR_YZ];
}

// Mass data for a solid box with the given half-extents, centred on the origin and axis-aligned.
export function computePhysics3DBoxMassData(
  halfExtentX: number,
  halfExtentY: number,
  halfExtentZ: number,
  density: number,
  out: Physics3DMassData,
): void {
  const mass = 8 * halfExtentX * halfExtentY * halfExtentZ * density;
  const x2 = halfExtentX * halfExtentX;
  const y2 = halfExtentY * halfExtentY;
  const z2 = halfExtentZ * halfExtentZ;

  // For a solid box of full extents 2h, I = m/12 * (a^2 + b^2) with a,b the two full extents; in
  // half-extents that is m/3 * (h^2 + h^2).
  writeDiagonal(out, mass, (mass * (y2 + z2)) / 3, (mass * (x2 + z2)) / 3, (mass * (x2 + y2)) / 3);
}

// Mass data for a solid capsule: a cylinder of `halfHeight` capped by two hemispheres of `radius`,
// centred on the origin with its axis along Y.
//
// The Y axis is the convention because a capsule is overwhelmingly used as an upright character
// collider, and the alternative — an axis parameter — puts a branch in a function whose whole job is to
// return six numbers. A capsule on another axis is this tensor rotated, which the body's orientation
// already does.
export function computePhysics3DCapsuleMassData(
  radius: number,
  halfHeight: number,
  density: number,
  out: Physics3DMassData,
): void {
  const height = halfHeight + halfHeight;
  const radius2 = radius * radius;

  const cylinderMass = Math.PI * radius2 * height * density;
  const hemisphereMass = (2 / 3) * Math.PI * radius2 * radius * density;
  const mass = cylinderMass + hemisphereMass + hemisphereMass;

  // Along the axis, cylinder and hemispheres are all rotating about their own symmetry axis.
  const axial = 0.5 * cylinderMass * radius2 + 2 * ((2 / 5) * hemisphereMass * radius2);

  // Across the axis: the cylinder's own transverse moment, plus each hemisphere's about its own centre
  // shifted out to where it sits. A hemisphere's centre of mass is 3r/8 from its flat face, and its
  // moment about a diameter through THAT centre is (2/5 - 9/64) m r^2 — the solid-sphere-half value
  // less the parallel-axis term that would move it back to the flat face.
  const hemisphereCenter = halfHeight + 0.375 * radius;
  const hemisphereOwn = hemisphereMass * radius2 * (2 / 5 - 9 / 64);
  const transverse =
    cylinderMass * ((height * height) / 12 + radius2 / 4) +
    2 * (hemisphereOwn + hemisphereMass * hemisphereCenter * hemisphereCenter);

  writeDiagonal(out, mass, transverse, axial, transverse);
}

// Writes `collider`'s mass, inertia tensor, and centroid into `out`, in the BODY's local frame — which
// is the frame the collider's own `local` shape is described in, so an offset or rotated collider
// contributes a tensor that is already offset and rotated.
//
// A convex hull carries NO mass. Its inertia is a volume integral over a triangulation this package
// cannot derive from a bare point list, so a hull collider currently behaves as immovable scenery:
// zero inverse mass, colliding normally, moved by nothing. That is deliberately inert rather than
// plausibly wrong — a hull given its bounding box's tensor would fall and spin at rates nothing in the
// solver could flag.
export function computePhysics3DColliderMassData(collider: Readonly<Physics3DCollider>, out: Physics3DMassData): void {
  const shape = collider.local;
  const density = collider.material.density;
  switch (shape.kind) {
    case 'sphere':
      computePhysics3DSphereMassData(shape.radius, density, out);
      out.centerX = shape.x;
      out.centerY = shape.y;
      out.centerZ = shape.z;
      return;
    case 'aabb':
      computePhysics3DBoxMassData(
        (shape.maxX - shape.minX) / 2,
        (shape.maxY - shape.minY) / 2,
        (shape.maxZ - shape.minZ) / 2,
        density,
        out,
      );
      out.centerX = (shape.minX + shape.maxX) / 2;
      out.centerY = (shape.minY + shape.maxY) / 2;
      out.centerZ = (shape.minZ + shape.maxZ) / 2;
      return;
    case 'box':
      computePhysics3DBoxMassData(shape.halfX, shape.halfY, shape.halfZ, density, out);
      // A box rotated within the body has three DISTINCT principal moments, so its tensor stops being
      // diagonal in the body frame. Skipping this rotation is the silent failure the whole tensor
      // representation exists to prevent: the mass and the diagonal both stay plausible, and only the
      // swing about an off-axis edge comes out wrong.
      rotateDiagonalTensor(out, shape.rotationX, shape.rotationY, shape.rotationZ, shape.rotationW);
      out.centerX = shape.x;
      out.centerY = shape.y;
      out.centerZ = shape.z;
      return;
    case 'capsule': {
      const axisX = shape.x1 - shape.x0;
      const axisY = shape.y1 - shape.y0;
      const axisZ = shape.z1 - shape.z0;
      const length = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ);
      computePhysics3DCapsuleMassData(shape.radius, length / 2, density, out);
      if (length > 0) alignTensorAxisToY(out, axisX / length, axisY / length, axisZ / length);
      out.centerX = (shape.x0 + shape.x1) / 2;
      out.centerY = (shape.y0 + shape.y1) / 2;
      out.centerZ = (shape.z0 + shape.z1) / 2;
      return;
    }
    default:
      out.mass = 0;
      out.inertiaXX = 0;
      out.inertiaYY = 0;
      out.inertiaZZ = 0;
      out.inertiaXY = 0;
      out.inertiaXZ = 0;
      out.inertiaYZ = 0;
      out.centerX = 0;
      out.centerY = 0;
      out.centerZ = 0;
  }
}

// Mass data for a solid sphere centred on the origin.
export function computePhysics3DSphereMassData(radius: number, density: number, out: Physics3DMassData): void {
  const mass = (4 / 3) * Math.PI * radius * radius * radius * density;
  const moment = 0.4 * mass * radius * radius;
  writeDiagonal(out, mass, moment, moment, moment);
}

// Allocates a zeroed mass-data record — no mass, no inertia, centred on the origin. The identity for
// `combinePhysics3DMassData`, so an assembly starts here and accumulates.
export function createPhysics3DMassData(): Physics3DMassData {
  return {
    mass: 0,
    inertiaXX: 0,
    inertiaYY: 0,
    inertiaZZ: 0,
    inertiaXY: 0,
    inertiaXZ: 0,
    inertiaYZ: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
  };
}

// Writes mass data onto a body, deriving the inverse mass and the LOCAL inverse inertia tensor.
//
// A non-dynamic or fixed-rotation body keeps its forward mass and inertia — a caller may still want to
// read them — but is given a zero inverse, which is the sentinel that makes the solver apply no impulse
// to it with no branch. The world-space inverse tensor is left alone: it is derived from the
// orientation and is refreshed by the step, not here.
export function setRigidBody3DMassData(body: RigidBody3D, data: Readonly<Physics3DMassData>): void {
  body.mass = data.mass;
  body.centerX = data.centerX;
  body.centerY = data.centerY;
  body.centerZ = data.centerZ;
  body.inertiaXX = data.inertiaXX;
  body.inertiaYY = data.inertiaYY;
  body.inertiaZZ = data.inertiaZZ;
  body.inertiaXY = data.inertiaXY;
  body.inertiaXZ = data.inertiaXZ;
  body.inertiaYZ = data.inertiaYZ;

  const movable = body.type === 'dynamic' && data.mass > 0;
  body.inverseMass = movable ? 1 / data.mass : 0;

  if (!movable || body.fixedRotation) {
    body.inverseInertiaXX = 0;
    body.inverseInertiaYY = 0;
    body.inverseInertiaZZ = 0;
    body.inverseInertiaXY = 0;
    body.inverseInertiaXZ = 0;
    body.inverseInertiaYZ = 0;
    return;
  }

  readTensor(data, scratchTensorA);
  inverseSymmetricTensor(scratchTensorA, scratchTensorB);
  body.inverseInertiaXX = scratchTensorB[TENSOR_XX];
  body.inverseInertiaYY = scratchTensorB[TENSOR_YY];
  body.inverseInertiaZZ = scratchTensorB[TENSOR_ZZ];
  body.inverseInertiaXY = scratchTensorB[TENSOR_XY];
  body.inverseInertiaXZ = scratchTensorB[TENSOR_XZ];
  body.inverseInertiaYZ = scratchTensorB[TENSOR_YZ];
}

// Recomputes `body`'s mass, inertia tensor, centre of mass, and the inverses the solver divides by,
// from its colliders. Call after adding, removing, or reshaping a collider, or after changing a
// material's density.
//
// Static and kinematic bodies keep their computed centre — the lever arms in a contact are measured from
// it either way — but take zero inverse mass and inverse inertia. Zero is not a guard, it is the
// arithmetic: an impulse scaled by an inverse mass of zero moves the body not at all, so "infinite mass"
// needs no branch anywhere in the solver.
export function updateRigidBody3DMassData(body: RigidBody3D): void {
  const total = acquirePhysics3DMassData();
  const one = acquirePhysics3DMassData();
  try {
    zeroPhysics3DMassData(total);
    for (const collider of body.colliders) {
      computePhysics3DColliderMassData(collider, one);
      // Combining shifts BOTH tensors onto the running centre, so the accumulation is correct at every
      // step rather than only at the end — which is why this needs no second pass over the colliders.
      combinePhysics3DMassData(total, one);
    }
    setRigidBody3DMassData(body, total);
  } finally {
    releasePhysics3DMassData(one);
    releasePhysics3DMassData(total);
  }
}

// Re-expresses a tensor whose Y axis is its symmetry axis so that the axis points along the given unit
// vector instead.
//
// The transverse moments are equal by symmetry, which collapses the general `R I R^T` to a form needing
// no basis at all: `transverse * Identity + (axial - transverse) * (axis (x) axis)`. Picking arbitrary
// perpendicular basis vectors would give the same answer with more arithmetic and one more chance to
// get a handedness wrong.
function alignTensorAxisToY(out: Physics3DMassData, axisX: number, axisY: number, axisZ: number): void {
  const axial = out.inertiaYY;
  const transverse = out.inertiaXX;
  const difference = axial - transverse;
  out.inertiaXX = transverse + difference * axisX * axisX;
  out.inertiaYY = transverse + difference * axisY * axisY;
  out.inertiaZZ = transverse + difference * axisZ * axisZ;
  out.inertiaXY = difference * axisX * axisY;
  out.inertiaXZ = difference * axisX * axisZ;
  out.inertiaYZ = difference * axisY * axisZ;
}

function readTensor(data: Readonly<Physics3DMassData>, out: number[]): void {
  out[TENSOR_XX] = data.inertiaXX;
  out[TENSOR_YY] = data.inertiaYY;
  out[TENSOR_ZZ] = data.inertiaZZ;
  out[TENSOR_XY] = data.inertiaXY;
  out[TENSOR_XZ] = data.inertiaXZ;
  out[TENSOR_YZ] = data.inertiaYZ;
}

// Re-expresses a DIAGONAL tensor in a frame rotated by the given unit quaternion.
//
// A diagonal tensor is `sum(lambda_i * e_i (x) e_i)` over the local axes, so rotating it is the same sum
// over the ROTATED axes — the columns of the quaternion's rotation matrix. That form is why this reads
// as three outer products rather than an `R I R^T` triple product: with `I` diagonal, the general
// product collapses to exactly this, at a third of the multiplications.
function rotateDiagonalTensor(out: Physics3DMassData, x: number, y: number, z: number, w: number): void {
  const a = out.inertiaXX;
  const b = out.inertiaYY;
  const c = out.inertiaZZ;

  const c0X = 1 - 2 * (y * y + z * z);
  const c0Y = 2 * (x * y + w * z);
  const c0Z = 2 * (x * z - w * y);
  const c1X = 2 * (x * y - w * z);
  const c1Y = 1 - 2 * (x * x + z * z);
  const c1Z = 2 * (y * z + w * x);
  const c2X = 2 * (x * z + w * y);
  const c2Y = 2 * (y * z - w * x);
  const c2Z = 1 - 2 * (x * x + y * y);

  out.inertiaXX = a * c0X * c0X + b * c1X * c1X + c * c2X * c2X;
  out.inertiaYY = a * c0Y * c0Y + b * c1Y * c1Y + c * c2Y * c2Y;
  out.inertiaZZ = a * c0Z * c0Z + b * c1Z * c1Z + c * c2Z * c2Z;
  out.inertiaXY = a * c0X * c0Y + b * c1X * c1Y + c * c2X * c2Y;
  out.inertiaXZ = a * c0X * c0Z + b * c1X * c1Z + c * c2X * c2Z;
  out.inertiaYZ = a * c0Y * c0Z + b * c1Y * c1Z + c * c2Y * c2Z;
}

function writeDiagonal(
  out: Physics3DMassData,
  mass: number,
  inertiaXX: number,
  inertiaYY: number,
  inertiaZZ: number,
): void {
  out.mass = mass;
  out.inertiaXX = inertiaXX;
  out.inertiaYY = inertiaYY;
  out.inertiaZZ = inertiaZZ;
  out.inertiaXY = 0;
  out.inertiaXZ = 0;
  out.inertiaYZ = 0;
  out.centerX = 0;
  out.centerY = 0;
  out.centerZ = 0;
}

function zeroPhysics3DMassData(out: Physics3DMassData): void {
  out.mass = 0;
  out.inertiaXX = 0;
  out.inertiaYY = 0;
  out.inertiaZZ = 0;
  out.inertiaXY = 0;
  out.inertiaXZ = 0;
  out.inertiaYZ = 0;
  out.centerX = 0;
  out.centerY = 0;
  out.centerZ = 0;
}

function acquirePhysics3DMassData(): Physics3DMassData {
  return physics3DMassDataPool.pop() ?? createPhysics3DMassData();
}

function releasePhysics3DMassData(data: Physics3DMassData): void {
  physics3DMassDataPool.push(data);
}

// A pool rather than two module scratch records, because `updateRigidBody3DMassData` holds two at once
// and is itself reachable from a collider mutation inside a caller that is already holding one.
const physics3DMassDataPool: Physics3DMassData[] = [];

// Module scratch for the two tensors a combine or an inversion needs at once. Reused rather than
// allocated because these run per body whenever mass properties change, and a rebuild of a large
// world's bodies would otherwise churn two arrays per primitive.
const scratchTensorA = [0, 0, 0, 0, 0, 0];
const scratchTensorB = [0, 0, 0, 0, 0, 0];
