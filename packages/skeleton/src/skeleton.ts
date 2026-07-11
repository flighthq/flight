import { copyMatrix4, createMatrix4, inverseMatrix4, multiplyMatrix4 } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix4 } from '@flighthq/node';
import type { Matrix4Like, SceneNode, Skeleton, SkeletonValidationDiagnostic } from '@flighthq/types';

// Allocates an independent Skeleton over the SAME joint SceneNodes with freshly-copied buffers and arrays.
// The inverseBindMatrices/jointMatrices Float32Arrays, the joints array, and the names array are duplicated
// (new identity), so the clone's palette can be recomputed without touching the original; the joint
// SceneNodes themselves are shared by reference (they are owned by the scene, not the skeleton).
export function cloneSkeleton(skeleton: Readonly<Skeleton>): Skeleton {
  const clone: Skeleton = {
    inverseBindMatrices: new Float32Array(skeleton.inverseBindMatrices),
    jointMatrices: new Float32Array(skeleton.jointMatrices),
    joints: skeleton.joints.slice(),
  };
  if (skeleton.names != null) clone.names = skeleton.names.slice();
  else if (skeleton.names === null) clone.names = null;
  return clone;
}

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
// as the palette buffer. `names` (aligned by index with `joints`) is optional and enables name-based lookup.
export function createSkeleton(
  joints: SceneNode[],
  inverseBindMatrices?: Float32Array,
  names?: readonly string[] | null,
): Skeleton {
  const count = joints.length;
  const skeleton: Skeleton = {
    inverseBindMatrices: inverseBindMatrices ?? new Float32Array(count * 16),
    jointMatrices: new Float32Array(count * 16),
    joints,
    names: names ?? null,
  };
  if (inverseBindMatrices === undefined) setSkeletonBindPose(skeleton);
  return skeleton;
}

// Drops the skeleton's references to its joint SceneNodes so they become eligible for GC when nothing else
// holds them, and clears any names. The skeleton does not own the joints (the scene does) and its buffers
// are plain GC-managed memory, so there is no GPU/native resource to free — this is a dispose, not a destroy.
export function disposeSkeleton(skeleton: Skeleton): void {
  skeleton.joints.length = 0;
  skeleton.names = null;
}

// Structural equality: same joint count, identical inverseBindMatrices contents, and matching names
// (both absent or element-for-element equal). Does not compare joint SceneNode identity or the live
// jointMatrices palette (a per-frame derived buffer), only the skeleton's defining bind data.
export function equalsSkeleton(a: Readonly<Skeleton>, b: Readonly<Skeleton>): boolean {
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

// Returns the index of the joint named `name`, or -1 when the skeleton has no names or none matches.
export function getSkeletonJointIndexByName(skeleton: Readonly<Skeleton>, name: string): number {
  const { names } = skeleton;
  if (names == null) return -1;
  return names.indexOf(name);
}

// Reads joint `jointIndex`'s current world matrix into `out` (allocation-free), for socketing a prop to a
// bone. Returns false and leaves `out` untouched when the index is out of range. The world matrix reflects
// the joints' latest transforms — call after the scene prepare walk, like computeSkeletonJointMatrices.
export function getSkeletonJointWorldMatrix(
  out: Matrix4Like,
  skeleton: Readonly<Skeleton>,
  jointIndex: number,
): boolean {
  const { joints } = skeleton;
  if (jointIndex < 0 || jointIndex >= joints.length) return false;
  copyMatrix4(out, getNodeWorldTransformMatrix4(joints[jointIndex]));
  return true;
}

// Name-based convenience over getSkeletonJointWorldMatrix: reads the world matrix of the joint named `name`
// into `out`. Returns false (leaving `out` untouched) when the skeleton has no names or none matches.
export function getSkeletonJointWorldMatrixByName(
  out: Matrix4Like,
  skeleton: Readonly<Skeleton>,
  name: string,
): boolean {
  return getSkeletonJointWorldMatrix(out, skeleton, getSkeletonJointIndexByName(skeleton, name));
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

// Checks that `inverseBindMatrices` holds exactly 16 floats per joint (jointCount * 16). Returns null when
// the skeleton is structurally valid, or a diagnostic describing the length mismatch when it is not. Never
// throws — a malformed skeleton is expected input to report on, not a programmer error.
export function validateSkeleton(skeleton: Readonly<Skeleton>): SkeletonValidationDiagnostic | null {
  const jointCount = skeleton.joints.length;
  const expectedInverseBindMatricesLength = jointCount * 16;
  const inverseBindMatricesLength = skeleton.inverseBindMatrices.length;
  if (inverseBindMatricesLength === expectedInverseBindMatricesLength) return null;
  return {
    expectedInverseBindMatricesLength,
    inverseBindMatricesLength,
    jointCount,
    message: `Skeleton inverseBindMatrices length ${inverseBindMatricesLength} does not match jointCount ${jointCount} * 16 = ${expectedInverseBindMatricesLength}.`,
  };
}

const _invBind = createMatrix4();
const _result = createMatrix4();
