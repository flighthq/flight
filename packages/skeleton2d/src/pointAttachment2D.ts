import { DEG_TO_RAD, RAD_TO_DEG } from '@flighthq/math/contract';
import type { PointAttachment2D, Skeleton2D, Vector2Like } from '@flighthq/types/contract';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

// Writes a point attachment's world position into `out`. Requires `computeSkeleton2DWorldTransforms` to
// have filled `skeleton.worldMatrices`. Out-parameter, allocation-free.
export function computeSkeleton2DPointAttachmentPosition(
  out: Vector2Like,
  attachment: Readonly<PointAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
): void {
  const world = skeleton.worldMatrices;
  if (boneIndex < 0 || boneIndex * MATRIX_STRIDE >= world.length) return;
  const b = boneIndex * MATRIX_STRIDE;
  const x = attachment.x;
  const y = attachment.y;
  out.x = world[b] * x + world[b + 2] * y + world[b + 4];
  out.y = world[b + 1] * x + world[b + 3] * y + world[b + 5];
}
// The point's world direction in DEGREES — its local rotation carried through the bone's world basis.
//
// It is derived from the bone's transformed X AXIS rather than by adding the bone's world rotation,
// because those differ the moment a bone carries non-uniform scale or shear: the axis is where the bone
// actually points, and the rotation angle is only where it would point if the basis were square. A point
// naming a muzzle direction on a squashed limb has to follow the axis.
export function computeSkeleton2DPointAttachmentRotation(
  attachment: Readonly<PointAttachment2D>,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
): number {
  const world = skeleton.worldMatrices;
  if (boneIndex < 0 || boneIndex * MATRIX_STRIDE >= world.length) return attachment.rotation;
  const b = boneIndex * MATRIX_STRIDE;
  const radians = attachment.rotation * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = world[b] * cos + world[b + 2] * sin;
  const y = world[b + 1] * cos + world[b + 3] * sin;
  return Math.atan2(y, x) * RAD_TO_DEG;
}
