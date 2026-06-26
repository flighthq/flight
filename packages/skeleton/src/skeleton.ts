import { createMatrix4, inverseMatrix4, multiplyMatrix4 } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type { SceneNode, Skeleton } from '@flighthq/types';

// Recomputes the skin palette from the joints' current world transforms:
// jointMatrices[j] = jointWorldMatrix(j) * inverseBindMatrices[j]. Call once per frame, after the joint
// SceneNodes' transforms are up to date (e.g. after applyAnimationClipToScene + the scene prepare walk),
// then upload `jointMatrices` as the bone uniform.
export function computeSkeletonJointMatrices(skeleton: Readonly<Skeleton>): void {
  const { inverseBindMatrices, jointMatrices, joints } = skeleton;
  for (let j = 0; j < joints.length; j++) {
    const base = j * 16;
    for (let i = 0; i < 16; i++) _invBind.m[i] = inverseBindMatrices[base + i];
    multiplyMatrix4(_result, getNodeWorldTransformMatrix4(joints[j]), _invBind);
    jointMatrices.set(_result.m, base);
  }
}

// Allocates a Skeleton over `joints`. `inverseBindMatrices` (flat, 16 column-major floats per joint) may
// be supplied (e.g. from a glTF accessor); when omitted it is captured from the joints' current world
// matrices via setSkeletonBindPose (the current pose becomes the rest pose). `jointMatrices` is allocated
// as the palette buffer.
export function createSkeleton(joints: SceneNode[], inverseBindMatrices?: Float32Array): Skeleton {
  const count = joints.length;
  const skeleton: Skeleton = {
    inverseBindMatrices: inverseBindMatrices ?? new Float32Array(count * 16),
    jointMatrices: new Float32Array(count * 16),
    joints,
  };
  if (inverseBindMatrices === undefined) setSkeletonBindPose(skeleton);
  return skeleton;
}

// Captures the joints' current world matrices as the bind pose by storing each one's inverse into
// inverseBindMatrices. After this, computeSkeletonJointMatrices yields identity until a joint moves.
export function setSkeletonBindPose(skeleton: Readonly<Skeleton>): void {
  const { inverseBindMatrices, joints } = skeleton;
  for (let j = 0; j < joints.length; j++) {
    inverseMatrix4(_result, getNodeWorldTransformMatrix4(joints[j]));
    inverseBindMatrices.set(_result.m, j * 16);
  }
}

const _invBind = createMatrix4();
const _result = createMatrix4();
