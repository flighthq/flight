import { RAD_TO_DEG } from '@flighthq/math/contract';
import type { Skeleton2D, Skeleton2DConstraint, Skeleton2DIkConstraint } from '@flighthq/types/contract';
import { Skeleton2DConstraintKind } from '@flighthq/types/contract';

import { computeSkeleton2DBoneWorldTransform } from './skeleton2d';
import { registerSkeleton2DConstraintSolver } from './skeleton2dConstraint';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

// Opts a bundle into IK. Nothing registers itself, so a rig that never solves IK sheds this whole module —
// which is the reason constraints are a registry rather than a switch.
export function registerSkeleton2DIkConstraintSolver(): void {
  registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Ik, solveSkeleton2DIkConstraint);
}

// Rotates a one- or two-bone chain so its tip reaches the target bone's world position, writing bone LOCAL
// rotations (and scales, when stretching or compressing) and refreshing the world matrix of each bone it
// moves. Descendants below the chain are left for the caller's world pass — see solveSkeleton2DConstraints.
//
// A chain of any other length, or an index out of range, is skipped: a rig can carry a constraint this
// solver does not cover without the whole pose failing.
export function solveSkeleton2DIkConstraint(skeleton: Skeleton2D, constraint: Readonly<Skeleton2DConstraint>): void {
  const ik = constraint as Readonly<Skeleton2DIkConstraint>;
  const bones = skeleton.bones;
  const world = skeleton.worldMatrices;
  const target = ik.targetBoneIndex;
  if (target < 0 || target >= bones.length) return;
  const targetX = world[target * MATRIX_STRIDE + 4];
  const targetY = world[target * MATRIX_STRIDE + 5];

  const chain = ik.boneIndices;
  if (chain.length === 1) {
    solveSkeleton2DIkChain1(skeleton, chain[0], targetX, targetY, ik);
    return;
  }
  if (chain.length === 2) solveSkeleton2DIkChain2(skeleton, chain[0], chain[1], targetX, targetY, ik);
}

// One bone: aim its local +x axis at the target. The target's world position is pulled back into the
// bone's PARENT space, because a bone's rotation field is local — the parent's own rotation is already
// accounted for by the basis it is expressed in, and comparing world angles instead would double-count it.
function solveSkeleton2DIkChain1(
  skeleton: Skeleton2D,
  boneIndex: number,
  targetX: number,
  targetY: number,
  ik: Readonly<Skeleton2DIkConstraint>,
): void {
  const bones = skeleton.bones;
  if (boneIndex < 0 || boneIndex >= bones.length) return;
  const bone = bones[boneIndex];
  const local = toSkeleton2DParentSpace(skeleton, boneIndex, targetX, targetY);
  if (local === null) return;

  const dx = local.x - bone.x;
  const dy = local.y - bone.y;
  // The shear is subtracted because it is baked into the bone's drawn x axis: the axis points along
  // rotation + shearX, so aiming the AXIS at the target means solving for the rotation behind it.
  const rotation = Math.atan2(dy, dx) * RAD_TO_DEG - bone.shearX;
  bone.rotation += wrapSkeleton2DAngle(rotation - bone.rotation) * ik.mix;

  if (ik.stretch || ik.compress) {
    const reach = Math.hypot(dx, dy);
    const length = bone.length * Math.abs(bone.scaleX);
    if (length > 0) {
      const wanted = reach / length;
      // Stretch only lengthens and compress only shortens, so a chain that already reaches is untouched by
      // either. Both blend by `mix`, so a half-applied constraint stretches half as far.
      if ((wanted > 1 && ik.stretch) || (wanted < 1 && ik.compress)) {
        const scale = 1 + (wanted - 1) * ik.mix;
        bone.scaleX *= scale;
        bone.scaleY *= scale;
      }
    }
  }
  computeSkeleton2DBoneWorldTransform(skeleton, boneIndex);
}

// Two bones: place the parent so the child's tip lands on the target — the elbow/knee solve. Both bone
// lengths are known, so this is the law of cosines rather than an iterative fit: the triangle formed by the
// parent's origin, the joint and the target has all three sides, so the two interior angles follow
// directly and `bendPositive` picks which of the two mirror solutions to take.
function solveSkeleton2DIkChain2(
  skeleton: Skeleton2D,
  parentIndex: number,
  childIndex: number,
  targetX: number,
  targetY: number,
  ik: Readonly<Skeleton2DIkConstraint>,
): void {
  const bones = skeleton.bones;
  if (parentIndex < 0 || parentIndex >= bones.length || childIndex < 0 || childIndex >= bones.length) return;
  const parent = bones[parentIndex];
  const child = bones[childIndex];
  const parentLength = parent.length * Math.abs(parent.scaleX);
  const childLength = child.length * Math.abs(child.scaleX);
  if (parentLength <= 0 || childLength <= 0) return;

  const local = toSkeleton2DParentSpace(skeleton, parentIndex, targetX, targetY);
  if (local === null) return;
  const dx = local.x - parent.x;
  const dy = local.y - parent.y;
  const reach = Math.hypot(dx, dy);
  if (reach <= 0) return;

  const span = parentLength + childLength;
  // Out of reach: the chain straightens and points at the target. Stretching scales both bones so the tip
  // lands on it anyway; without stretch the chain simply falls short, which is what a real limb does.
  let bendAngle: number;
  if (reach >= span) {
    bendAngle = 0;
    // Only the PARENT is scaled. The child inherits its parent's scale, so scaling both would compound —
    // a chain stretched to twice its reach would extend four times as far on its second bone.
    if (ik.stretch) {
      const scale = 1 + (reach / span - 1) * ik.mix;
      parent.scaleX *= scale;
      parent.scaleY *= scale;
    }
  } else {
    // Law of cosines on the joint angle, measured as the deviation from straight.
    //
    // The clamps are load-bearing, not defensive. Unequal bone lengths leave a DEAD ZONE around the
    // parent's origin — a target nearer than |parentLength − childLength|, which the chain cannot reach
    // however far it folds — and inside it both cosines leave [−1, 1] by exactly the amount that clamps
    // to the fully folded pose: cosJoint ≥ 1 gives a bend of π, and cosParent saturates at +1 or −1 to
    // give the parent offset the longer bone requires. So the dead zone needs no case of its own, and
    // dropping a clamp does not merely admit a NaN, it loses that pose.
    const cosJoint =
      (parentLength * parentLength + childLength * childLength - reach * reach) / (2 * parentLength * childLength);
    bendAngle = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosJoint)));
  }

  // The parent turns off the straight-at-target direction by the triangle's other interior angle.
  const cosParent =
    (parentLength * parentLength + reach * reach - childLength * childLength) / (2 * parentLength * reach);
  const parentOffset = reach >= span ? 0 : Math.acos(Math.min(1, Math.max(-1, cosParent)));
  const direction = ik.bendPositive ? 1 : -1;
  const aim = Math.atan2(dy, dx);

  const parentRotation = (aim + parentOffset * direction) * RAD_TO_DEG - parent.shearX;
  parent.rotation += wrapSkeleton2DAngle(parentRotation - parent.rotation) * ik.mix;
  computeSkeleton2DBoneWorldTransform(skeleton, parentIndex);

  // The child's rotation is local to the parent it has just been given, so it is the bend angle directly
  // rather than a world angle — which is why the parent has to be refreshed first. It bends BACK toward
  // the target, opposite the way the parent was swung off the aim line, which is what the negation is.
  const childRotation = -bendAngle * direction * RAD_TO_DEG - child.shearX;
  child.rotation += wrapSkeleton2DAngle(childRotation - child.rotation) * ik.mix;
  computeSkeleton2DBoneWorldTransform(skeleton, childIndex);
}

// A world point in the space a bone's local transform is expressed in — its parent's. A root bone's local
// space IS world space. Returns null for a parent basis with no inverse, which is a bone collapsed to zero
// scale: there is no meaningful direction to aim along, so the constraint is skipped rather than producing
// infinities.
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

// The shortest signed way round from one angle to another, in degrees. Blending a raw difference would
// take the long way whenever a solve crosses ±180°, which reads as a limb spinning the wrong way for one
// frame.
function wrapSkeleton2DAngle(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  else if (value < -180) value += 360;
  return value;
}

const MINIMUM_DETERMINANT = 1e-9;
