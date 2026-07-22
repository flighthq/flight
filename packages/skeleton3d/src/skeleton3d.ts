import { createEntity } from '@flighthq/entity';
import { copyMatrix4, createMatrix4, inverseMatrix4, multiplyMatrix4 } from '@flighthq/geometry';
import { addNodeChild, getNodeParent, getNodeWorldMatrix4 } from '@flighthq/node';
import type { Matrix4Like, SceneNode, Skeleton3D, Skeleton3DValidationDiagnostic } from '@flighthq/types';

export function cloneSkeleton3D(skeleton: Readonly<Skeleton3D>): Skeleton3D {
  const clone = createEntity({
    inverseBindMatrices: new Float32Array(skeleton.inverseBindMatrices),
    jointMatrices: new Float32Array(skeleton.jointMatrices),
    joints: skeleton.joints.slice(),
    names: skeleton.names === undefined ? undefined : skeleton.names === null ? null : skeleton.names.slice(),
  });
  return clone;
}

// Clones a skeleton and its joint-to-joint hierarchy without assuming that every SceneNode kind is
// generically cloneable. `cloneJoint` is the one narrow policy seam: it must return a fresh detached
// node carrying the source joint's local pose/data. Parent links whose parent is another skeleton
// joint are rebuilt over the cloned nodes; a parent outside the joint set is intentionally left to
// the caller's surrounding scene clone. Buffers, names, joint nodes, and hierarchy are all independent.
export function cloneSkeleton3DJointHierarchy(
  skeleton: Readonly<Skeleton3D>,
  cloneJoint: (joint: Readonly<SceneNode>, jointIndex: number) => SceneNode,
): Skeleton3D {
  const sourceJoints = skeleton.joints;
  const joints = new Array<SceneNode>(sourceJoints.length);
  const clonesBySource = new Map<SceneNode, SceneNode>();
  for (let i = 0; i < sourceJoints.length; i++) {
    const source = sourceJoints[i];
    const clone = cloneJoint(source, i);
    joints[i] = clone;
    clonesBySource.set(source, clone);
  }
  for (let i = 0; i < sourceJoints.length; i++) {
    const sourceParent = getNodeParent(sourceJoints[i]);
    if (sourceParent === null) continue;
    const parentClone = clonesBySource.get(sourceParent);
    if (parentClone !== undefined) addNodeChild(parentClone, joints[i]);
  }
  return createEntity({
    inverseBindMatrices: new Float32Array(skeleton.inverseBindMatrices),
    jointMatrices: new Float32Array(skeleton.jointMatrices),
    joints,
    names: skeleton.names === undefined ? undefined : skeleton.names === null ? null : skeleton.names.slice(),
  });
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
  const skeleton = createEntity({
    inverseBindMatrices: inverseBindMatrices ?? new Float32Array(count * 16),
    jointMatrices: new Float32Array(count * 16),
    joints,
    names: names ?? null,
  });
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
