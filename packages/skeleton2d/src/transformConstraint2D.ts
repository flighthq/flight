import { RAD_TO_DEG } from '@flighthq/math/contract';
import type { Skeleton2D, Skeleton2DConstraint, Skeleton2DTransformConstraint } from '@flighthq/types/contract';
import { Skeleton2DConstraintKind } from '@flighthq/types/contract';

import { computeSkeleton2DBoneWorldTransform } from './skeleton2d';
import { registerSkeleton2DConstraintSolver } from './skeleton2dConstraint';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

// Opts a bundle into transform constraints. Nothing registers itself, so a rig that only uses IK sheds
// this whole module.
export function registerSkeleton2DTransformConstraintSolver(): void {
  registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Transform, solveSkeleton2DTransformConstraint);
}

// Copies the target bone's world transform onto each constrained bone, per channel, blended by that
// channel's mix times the constraint's own. Writes bone LOCAL transforms and refreshes each bone it moves;
// descendants are left for the caller's world pass.
//
// The copy is world-to-local rather than field-to-field, and that is the substance of it: the target's
// world rotation, translation, scale and shear are decomposed, offset, mixed against the constrained
// bone's CURRENT world values, and the result is pushed back through the bone's parent basis to become a
// local transform. Copying local field to local field instead would mean two bones under differently
// rotated parents ending up visually unaligned while their numbers matched.
export function solveSkeleton2DTransformConstraint(
  skeleton: Skeleton2D,
  constraint: Readonly<Skeleton2DConstraint>,
): void {
  const transform = constraint as Readonly<Skeleton2DTransformConstraint>;
  const bones = skeleton.bones;
  const world = skeleton.worldMatrices;
  const target = transform.targetBoneIndex;
  if (target < 0 || target >= bones.length) return;

  const t = target * MATRIX_STRIDE;
  const targetRotation = Math.atan2(world[t + 1], world[t]) * RAD_TO_DEG;
  const targetScaleX = Math.hypot(world[t], world[t + 1]);
  const targetScaleY = Math.hypot(world[t + 2], world[t + 3]);
  // Shear is the departure of the y axis from perpendicular: a square basis has exactly 90° between its
  // columns, so anything else is the skew the bone carries.
  const targetShearY = Math.atan2(world[t + 3], world[t + 2]) * RAD_TO_DEG - 90 - targetRotation;
  const targetX = world[t + 4];
  const targetY = world[t + 5];

  const mix = transform.mix;
  for (const boneIndex of transform.boneIndices) {
    if (boneIndex < 0 || boneIndex >= bones.length) continue;
    const bone = bones[boneIndex];
    const o = boneIndex * MATRIX_STRIDE;

    const rotateMix = transform.mixRotate * mix;
    const scaleXMix = transform.mixScaleX * mix;
    const scaleYMix = transform.mixScaleY * mix;
    const shearMix = transform.mixShearY * mix;

    if (rotateMix !== 0) {
      const current = Math.atan2(world[o + 1], world[o]) * RAD_TO_DEG;
      const wanted = targetRotation + transform.offsetRotation;
      bone.rotation += wrapSkeleton2DAngle(wanted - current) * rotateMix;
    }
    if (scaleXMix !== 0) {
      const current = Math.hypot(world[o], world[o + 1]);
      if (current > 0) bone.scaleX *= 1 + ((targetScaleX + transform.offsetScaleX) / current - 1) * scaleXMix;
    }
    if (scaleYMix !== 0) {
      const current = Math.hypot(world[o + 2], world[o + 3]);
      if (current > 0) bone.scaleY *= 1 + ((targetScaleY + transform.offsetScaleY) / current - 1) * scaleYMix;
    }
    if (shearMix !== 0) {
      const currentRotation = Math.atan2(world[o + 1], world[o]) * RAD_TO_DEG;
      const current = Math.atan2(world[o + 3], world[o + 2]) * RAD_TO_DEG - 90 - currentRotation;
      bone.shearY += wrapSkeleton2DAngle(targetShearY + transform.offsetShearY - current) * shearMix;
    }

    const translateXMix = transform.mixX * mix;
    const translateYMix = transform.mixY * mix;
    if (translateXMix !== 0 || translateYMix !== 0) {
      // The wanted world position is mixed first and converted once, because converting each axis
      // separately would apply a rotated parent basis to a half-moved point and skew the result.
      const wantedX = world[o + 4] + (targetX + transform.offsetX - world[o + 4]) * translateXMix;
      const wantedY = world[o + 5] + (targetY + transform.offsetY - world[o + 5]) * translateYMix;
      const local = toSkeleton2DParentSpace(skeleton, boneIndex, wantedX, wantedY);
      if (local !== null) {
        bone.x = local.x;
        bone.y = local.y;
      }
    }
    computeSkeleton2DBoneWorldTransform(skeleton, boneIndex);
  }
}

// A world point in the space a bone's local transform is expressed in — its parent's. A root bone's local
// space IS world space. Null for a parent basis with no inverse, which is a bone collapsed to zero scale.
function toSkeleton2DParentSpace(
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const parentIndex = skeleton.bones[boneIndex].parentIndex;
  if (parentIndex < 0) return { x, y };
  const world = skeleton.worldMatrices;
  const p = parentIndex * MATRIX_STRIDE;
  const a = world[p];
  const b = world[p + 1];
  const c = world[p + 2];
  const d = world[p + 3];
  const determinant = a * d - c * b;
  if (Math.abs(determinant) < MINIMUM_DETERMINANT) return null;
  const wx = x - world[p + 4];
  const wy = y - world[p + 5];
  return { x: (d * wx - c * wy) / determinant, y: (a * wy - b * wx) / determinant };
}

// The shortest signed way round from one angle to another, in degrees, so a mix never takes the long way
// past ±180° and reads as a bone spinning backwards for a frame.
function wrapSkeleton2DAngle(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  else if (value < -180) value += 360;
  return value;
}

const MINIMUM_DETERMINANT = 1e-9;
