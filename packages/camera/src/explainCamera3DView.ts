import type { Camera3D, Camera3DViewExplanation } from '@flighthq/types/contract';

// Reports whether a camera's view matrix satisfies the orthonormality precondition its consumers rely
// on, as PLAIN DATA rather than a verdict. Callers get the measured deviations and decide for
// themselves what that means for the answer they got — `getCamera3DPosition`, for instance, is exact
// for any orthogonal basis and merely wrong for a scaled one, which is a judgement about their use, not
// about the matrix.
//
// Reflections pass: `determinant` is reported so a caller can tell a mirror camera (-1) from a rigid one
// (+1), but neither is a violation — an improper orthogonal matrix still satisfies Rᵀ = R⁻¹.
//
// Shakeable: nothing in the render path calls this, so an application that never asks sheds it entirely.
export function explainCamera3DView(camera: Readonly<Camera3D>): Camera3DViewExplanation {
  const m = camera.view.m;
  const x = { x: m[0], y: m[1], z: m[2] };
  const y = { x: m[4], y: m[5], z: m[6] };
  const z = { x: m[8], y: m[9], z: m[10] };

  const lengthX = Math.hypot(x.x, x.y, x.z);
  const lengthY = Math.hypot(y.x, y.y, y.z);
  const lengthZ = Math.hypot(z.x, z.y, z.z);

  const determinant =
    m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);

  // Largest absolute deviation from unit length across the three basis vectors, and from zero across
  // the three pairwise dots. One number each, so a caller can threshold without redoing the algebra.
  const scaleDeviation = Math.max(Math.abs(lengthX - 1), Math.abs(lengthY - 1), Math.abs(lengthZ - 1));
  const shearDeviation = Math.max(
    Math.abs(x.x * y.x + x.y * y.y + x.z * y.z),
    Math.abs(x.x * z.x + x.y * z.y + x.z * z.z),
    Math.abs(y.x * z.x + y.y * z.y + y.z * z.z),
  );

  return {
    determinant,
    isOrthonormal: scaleDeviation <= ORTHONORMAL_TOLERANCE && shearDeviation <= ORTHONORMAL_TOLERANCE,
    isReflection: determinant < 0,
    scaleDeviation,
    shearDeviation,
  };
}

// Loose enough to pass a matrix that has been through a decompose/recompose round trip in float32,
// tight enough that a deliberate scale of even 1% is reported.
const ORTHONORMAL_TOLERANCE = 1e-3;
