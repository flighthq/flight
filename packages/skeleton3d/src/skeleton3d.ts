import { copyMatrix4, createMatrix4, inverseMatrix4, multiplyMatrix4 } from '@flighthq/geometry';
import { getNodeWorldMatrix4 } from '@flighthq/node';
import type { Matrix4Like, SceneNode, Skeleton3D, Skeleton3DValidationDiagnostic } from '@flighthq/types';

export function cloneSkeleton3D(skeleton: Readonly<Skeleton3D>): Skeleton3D {
  const clone: Skeleton3D = {
    inverseBindMatrices: new Float32Array(skeleton.inverseBindMatrices),
    jointMatrices: new Float32Array(skeleton.jointMatrices),
    joints: skeleton.joints.slice(),
  };
  if (skeleton.names != null) clone.names = skeleton.names.slice();
  else if (skeleton.names === null) clone.names = null;
  return clone;
}

export function computeSkeleton3DJointMatrices(skeleton: Readonly<Skeleton3D>): void {
  const { inverseBindMatrices, jointMatrices, joints } = skeleton;
  for (let j = 0; j < joints.length; j++) {
    const base = j * 16;
    for (let i = 0; i < 16; i++) _invBind.m[i] = inverseBindMatrices[base + i];
    multiplyMatrix4(_result, getNodeWorldMatrix4(joints[j]), _invBind);
    jointMatrices.set(_result.m, base);
  }
}

export function createSkeleton3D(
  joints: SceneNode[],
  inverseBindMatrices?: Float32Array,
  names?: readonly string[] | null,
): Skeleton3D {
  const count = joints.length;
  const skeleton: Skeleton3D = {
    inverseBindMatrices: inverseBindMatrices ?? new Float32Array(count * 16),
    jointMatrices: new Float32Array(count * 16),
    joints,
    names: names ?? null,
  };
  if (inverseBindMatrices === undefined) setSkeleton3DBindPose(skeleton);
  return skeleton;
}

export function disposeSkeleton3D(skeleton: Skeleton3D): void {
  skeleton.joints.length = 0;
  skeleton.names = null;
}

export function equalsSkeleton3D(a: Readonly<Skeleton3D>, b: Readonly<Skeleton3D>): boolean {
  if (a === b) return true;
  if (a.joints.length !== b.joints.length) return false;
  if (a.inverseBindMatrices.length !== b.inverseBindMatrices.length) return false;
  for (let i = 0; i < a.inverseBindMatrices.length; i++) {
    if (a.inverseBindMatrices[i] !== b.inverseBindMatrices[i]) return false;
  }
  const aNames = a.names ?? null;
  const bNames = b.names ?? null;
  if (aNames === null || bNames === null) return aNames === bNames;
  if (aNames.length !== bNames.length) return false;
  for (let i = 0; i < aNames.length; i++) {
    if (aNames[i] !== bNames[i]) return false;
  }
  return true;
}

export function getSkeleton3DJointIndexByName(skeleton: Readonly<Skeleton3D>, name: string): number {
  const { names } = skeleton;
  if (names == null) return -1;
  return names.indexOf(name);
}

export function getSkeleton3DJointWorldMatrix(
  out: Matrix4Like,
  skeleton: Readonly<Skeleton3D>,
  jointIndex: number,
): boolean {
  const { joints } = skeleton;
  if (jointIndex < 0 || jointIndex >= joints.length) return false;
  copyMatrix4(out, getNodeWorldMatrix4(joints[jointIndex]));
  return true;
}

export function getSkeleton3DJointWorldMatrixByName(
  out: Matrix4Like,
  skeleton: Readonly<Skeleton3D>,
  name: string,
): boolean {
  return getSkeleton3DJointWorldMatrix(out, skeleton, getSkeleton3DJointIndexByName(skeleton, name));
}

export function setSkeleton3DBindPose(skeleton: Readonly<Skeleton3D>): void {
  const { inverseBindMatrices, joints } = skeleton;
  for (let j = 0; j < joints.length; j++) {
    inverseMatrix4(_result, getNodeWorldMatrix4(joints[j]));
    inverseBindMatrices.set(_result.m, j * 16);
  }
}

export function validateSkeleton3D(skeleton: Readonly<Skeleton3D>): Skeleton3DValidationDiagnostic | null {
  const jointCount = skeleton.joints.length;
  const expectedInverseBindMatricesLength = jointCount * 16;
  const inverseBindMatricesLength = skeleton.inverseBindMatrices.length;
  if (inverseBindMatricesLength === expectedInverseBindMatricesLength) return null;
  return {
    expectedInverseBindMatricesLength,
    inverseBindMatricesLength,
    jointCount,
    message: `Skeleton3D inverseBindMatrices length ${inverseBindMatricesLength} does not match jointCount ${jointCount} * 16 = ${expectedInverseBindMatricesLength}.`,
  };
}

const _invBind = createMatrix4();
const _result = createMatrix4();
