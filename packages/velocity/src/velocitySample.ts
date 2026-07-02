import type { Matrix, Velocity2D, VelocitySample } from '@flighthq/types';

// Returns the per-pixel screen-space velocity at local-space point (`pointX`, `pointY`) by computing
// `current·p − previous·p` using the sample's stored previousWorldTransform and the node's current world
// transform. Writes the result into `out`. Returns zero when the sample has no previous transform.
//
// Use when the full affine delta (rotation + scale) at a specific point is needed, such as when writing
// a per-pixel velocity buffer from a screen-space fragment shader.
export function getVelocitySampleAt(
  sample: Readonly<VelocitySample>,
  currentWorldTransform: Readonly<Matrix>,
  pointX: number,
  pointY: number,
  out: Velocity2D,
): Velocity2D {
  if (sample.previousWorldTransform === null) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  // Read both transforms into locals before writing out (alias safety, though out is Velocity2D here).
  const cx = currentWorldTransform.a * pointX + currentWorldTransform.c * pointY + currentWorldTransform.tx;
  const cy = currentWorldTransform.b * pointX + currentWorldTransform.d * pointY + currentWorldTransform.ty;
  const px =
    sample.previousWorldTransform.a * pointX +
    sample.previousWorldTransform.c * pointY +
    sample.previousWorldTransform.tx;
  const py =
    sample.previousWorldTransform.b * pointX +
    sample.previousWorldTransform.d * pointY +
    sample.previousWorldTransform.ty;
  out.x = cx - px;
  out.y = cy - py;
  return out;
}
