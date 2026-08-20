import type { Physics3DMassData, RigidBody3D } from '@flighthq/types/contract';

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
// hull's and a triangle mesh's are integrals over their geometry, and arrive with the 3D narrow phase
// that produces those shapes in the first place.
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

function readTensor(data: Readonly<Physics3DMassData>, out: number[]): void {
  out[TENSOR_XX] = data.inertiaXX;
  out[TENSOR_YY] = data.inertiaYY;
  out[TENSOR_ZZ] = data.inertiaZZ;
  out[TENSOR_XY] = data.inertiaXY;
  out[TENSOR_XZ] = data.inertiaXZ;
  out[TENSOR_YZ] = data.inertiaYZ;
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

// Module scratch for the two tensors a combine or an inversion needs at once. Reused rather than
// allocated because these run per body whenever mass properties change, and a rebuild of a large
// world's bodies would otherwise churn two arrays per primitive.
const scratchTensorA = [0, 0, 0, 0, 0, 0];
const scratchTensorB = [0, 0, 0, 0, 0, 0];
