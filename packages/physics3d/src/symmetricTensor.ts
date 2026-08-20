// Symmetric 3x3 tensor arithmetic, in the six-component form the solver stores inertia in.
//
// Package-internal: these are how the mass and constraint code reads a tensor, not part of the
// physics3d API. They take and return loose numbers rather than a matrix type because an inertia tensor
// lives as six flat fields on `RigidBody3D` — `@flighthq/geometry`'s `Matrix3` is an `Entity` wrapping a
// `Float32Array`, which is both an indirection in a hot loop and a precision step down from what a
// solver's accumulators need.
//
// Every function here writes into a caller-provided `out` array of six numbers, ordered
// `[xx, yy, zz, xy, xz, yz]`, and is safe when `out` also supplies the input.

// Component offsets into the six-number form. Named so a caller indexes by meaning rather than by a
// number whose order it has to remember.
export const TENSOR_XX = 0;
export const TENSOR_YY = 1;
export const TENSOR_ZZ = 2;
export const TENSOR_XY = 3;
export const TENSOR_XZ = 4;
export const TENSOR_YZ = 5;

// Applies a symmetric tensor to a vector, writing `tensor * v` into `out`. The workhorse: every
// constraint row multiplies an angular term by an inverse inertia tensor.
export function applySymmetricTensor(
  tensor: Readonly<ArrayLike<number>>,
  vX: number,
  vY: number,
  vZ: number,
  out: number[],
): void {
  const xx = tensor[TENSOR_XX];
  const yy = tensor[TENSOR_YY];
  const zz = tensor[TENSOR_ZZ];
  const xy = tensor[TENSOR_XY];
  const xz = tensor[TENSOR_XZ];
  const yz = tensor[TENSOR_YZ];

  out[0] = xx * vX + xy * vY + xz * vZ;
  out[1] = xy * vX + yy * vY + yz * vZ;
  out[2] = xz * vX + yz * vY + zz * vZ;
}

// Inverts a symmetric tensor, writing the result into `out`. Returns false and writes a zero tensor
// when the tensor is singular — which is the ordinary case, not an error: a static body, a
// fixed-rotation body, and a zero-mass body all carry a singular inertia, and a zero inverse is exactly
// what makes "infinite inertia" fall out of the same arithmetic as any other body with no branch.
//
// The determinant is compared against a scale-relative epsilon rather than an absolute one, because an
// inertia tensor's magnitude tracks mass times length squared and a fixed epsilon would call a small
// but perfectly invertible body singular.
export function inverseSymmetricTensor(tensor: Readonly<ArrayLike<number>>, out: number[]): boolean {
  const xx = tensor[TENSOR_XX];
  const yy = tensor[TENSOR_YY];
  const zz = tensor[TENSOR_ZZ];
  const xy = tensor[TENSOR_XY];
  const xz = tensor[TENSOR_XZ];
  const yz = tensor[TENSOR_YZ];

  // Cofactors of the symmetric matrix; only six are distinct.
  const cofactorXX = yy * zz - yz * yz;
  const cofactorXY = xz * yz - xy * zz;
  const cofactorXZ = xy * yz - xz * yy;
  const determinant = xx * cofactorXX + xy * cofactorXY + xz * cofactorXZ;

  const scale = Math.abs(xx) + Math.abs(yy) + Math.abs(zz);
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= SINGULAR_EPSILON * scale * scale * scale) {
    out[TENSOR_XX] = 0;
    out[TENSOR_YY] = 0;
    out[TENSOR_ZZ] = 0;
    out[TENSOR_XY] = 0;
    out[TENSOR_XZ] = 0;
    out[TENSOR_YZ] = 0;
    return false;
  }

  const inverseDeterminant = 1 / determinant;
  out[TENSOR_XX] = cofactorXX * inverseDeterminant;
  out[TENSOR_YY] = (xx * zz - xz * xz) * inverseDeterminant;
  out[TENSOR_ZZ] = (xx * yy - xy * xy) * inverseDeterminant;
  out[TENSOR_XY] = cofactorXY * inverseDeterminant;
  out[TENSOR_XZ] = cofactorXZ * inverseDeterminant;
  out[TENSOR_YZ] = (xy * xz - xx * yz) * inverseDeterminant;
  return true;
}

// Rotates a symmetric tensor into world space by a unit quaternion, writing `R * tensor * transpose(R)`
// into `out`. The result is symmetric by construction, so only six components are produced.
//
// The rotation matrix is built once and applied as two multiplies rather than composing the similarity
// transform in closed quaternion form: the closed form is longer, no faster, and far harder to check
// against a reference implementation.
export function rotateSymmetricTensor(
  tensor: Readonly<ArrayLike<number>>,
  quaternionX: number,
  quaternionY: number,
  quaternionZ: number,
  quaternionW: number,
  out: number[],
): void {
  const x2 = quaternionX + quaternionX;
  const y2 = quaternionY + quaternionY;
  const z2 = quaternionZ + quaternionZ;
  const xx2 = quaternionX * x2;
  const yy2 = quaternionY * y2;
  const zz2 = quaternionZ * z2;
  const xy2 = quaternionX * y2;
  const xz2 = quaternionX * z2;
  const yz2 = quaternionY * z2;
  const wx2 = quaternionW * x2;
  const wy2 = quaternionW * y2;
  const wz2 = quaternionW * z2;

  // Column-major rotation basis: r0 is the image of the local x axis, and so on.
  const r00 = 1 - yy2 - zz2;
  const r10 = xy2 + wz2;
  const r20 = xz2 - wy2;
  const r01 = xy2 - wz2;
  const r11 = 1 - xx2 - zz2;
  const r21 = yz2 + wx2;
  const r02 = xz2 + wy2;
  const r12 = yz2 - wx2;
  const r22 = 1 - xx2 - yy2;

  const xx = tensor[TENSOR_XX];
  const yy = tensor[TENSOR_YY];
  const zz = tensor[TENSOR_ZZ];
  const xy = tensor[TENSOR_XY];
  const xz = tensor[TENSOR_XZ];
  const yz = tensor[TENSOR_YZ];

  // m = tensor * transpose(R). Since `transpose(R)[k][j]` is `R[j][k]`, each entry pairs a row of the
  // tensor with a ROW of R — pairing it with a column instead silently computes `R * tensor * R`, which
  // agrees with the right answer for every symmetric rotation and disagrees for a quarter turn.
  const m00 = xx * r00 + xy * r01 + xz * r02;
  const m01 = xx * r10 + xy * r11 + xz * r12;
  const m02 = xx * r20 + xy * r21 + xz * r22;
  const m10 = xy * r00 + yy * r01 + yz * r02;
  const m11 = xy * r10 + yy * r11 + yz * r12;
  const m12 = xy * r20 + yy * r21 + yz * r22;
  const m20 = xz * r00 + yz * r01 + zz * r02;
  const m21 = xz * r10 + yz * r11 + zz * r12;
  const m22 = xz * r20 + yz * r21 + zz * r22;

  out[TENSOR_XX] = r00 * m00 + r01 * m10 + r02 * m20;
  out[TENSOR_YY] = r10 * m01 + r11 * m11 + r12 * m21;
  out[TENSOR_ZZ] = r20 * m02 + r21 * m12 + r22 * m22;
  out[TENSOR_XY] = r00 * m01 + r01 * m11 + r02 * m21;
  out[TENSOR_XZ] = r00 * m02 + r01 * m12 + r02 * m22;
  out[TENSOR_YZ] = r10 * m02 + r11 * m12 + r12 * m22;
}

// Shifts a symmetric tensor from an axis through the centre of mass to a parallel axis offset by
// (`dX`,`dY`,`dZ`), writing the result into `out` — the parallel-axis theorem,
// `I + mass * (dot(d,d) * identity - outer(d,d))`.
//
// This is what lets primitives combine without an eigenvalue solve: each contributes its own tensor
// about its own centre, and every one of them is shifted to the assembly's centre and summed. Note the
// direction — this moves AWAY from the centre of mass. Passing a negated offset does not move back,
// because the correction is quadratic in the offset and therefore even.
export function translateSymmetricTensor(
  tensor: Readonly<ArrayLike<number>>,
  mass: number,
  dX: number,
  dY: number,
  dZ: number,
  out: number[],
): void {
  const xx = tensor[TENSOR_XX];
  const yy = tensor[TENSOR_YY];
  const zz = tensor[TENSOR_ZZ];
  const xy = tensor[TENSOR_XY];
  const xz = tensor[TENSOR_XZ];
  const yz = tensor[TENSOR_YZ];

  out[TENSOR_XX] = xx + mass * (dY * dY + dZ * dZ);
  out[TENSOR_YY] = yy + mass * (dX * dX + dZ * dZ);
  out[TENSOR_ZZ] = zz + mass * (dX * dX + dY * dY);
  out[TENSOR_XY] = xy - mass * dX * dY;
  out[TENSOR_XZ] = xz - mass * dX * dZ;
  out[TENSOR_YZ] = yz - mass * dY * dZ;
}

// Relative tolerance for calling a tensor singular. Cubed against the tensor's trace scale in
// `inverseSymmetricTensor`, since a 3x3 determinant carries three factors of the matrix's magnitude.
const SINGULAR_EPSILON = 1e-12;
