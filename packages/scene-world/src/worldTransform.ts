import { copyMatrix4, createMatrix4, inverseMatrix4, matrix4TransformPoint, multiplyMatrix4 } from '@flighthq/geometry';
import type { HasTransform3DRuntime, Matrix4Like, Vector3Like, WorldTransform3DNode } from '@flighthq/types';

import { getWorldNodeRuntime, type WorldNodeRuntime } from './worldNode';

export function ensureWorldMatrix(target: WorldTransform3DNode): void {
  const runtime = getWorldNodeRuntime(target) as WorldNodeRuntime & HasTransform3DRuntime;
  const parent = runtime.parent as WorldTransform3DNode | null;

  let parentRuntime: (WorldNodeRuntime & HasTransform3DRuntime) | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureWorldMatrix(parent);
    parentRuntime = getWorldNodeRuntime(parent) as WorldNodeRuntime & HasTransform3DRuntime;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldMatrix(runtime, target.localMatrix, parentRuntime);
  }
}

export function getWorldMatrix(target: WorldTransform3DNode): Readonly<Matrix4Like> {
  ensureWorldMatrix(target);
  return (getWorldNodeRuntime(target) as WorldNodeRuntime & HasTransform3DRuntime).worldMatrix!;
}

/** Transforms a point from world space into the node's local space. */
export function worldGlobalToLocal(out: Vector3Like, source: WorldTransform3DNode, point: Readonly<Vector3Like>): void {
  const inv = createMatrix4();
  inverseMatrix4(inv, getWorldMatrix(source));
  matrix4TransformPoint(out, inv, point);
}

/** Transforms a point from the node's local space into world space. */
export function worldLocalToGlobal(out: Vector3Like, source: WorldTransform3DNode, point: Readonly<Vector3Like>): void {
  matrix4TransformPoint(out, getWorldMatrix(source), point);
}

function recomputeWorldMatrix(
  runtime: WorldNodeRuntime & HasTransform3DRuntime,
  localMatrix: Readonly<Matrix4Like>,
  parentRuntime?: Readonly<WorldNodeRuntime & HasTransform3DRuntime>,
): void {
  if (runtime.worldMatrix === null) {
    runtime.worldMatrix = createMatrix4();
  }

  if (parentRuntime !== undefined) {
    // worldMatrix = parent.worldMatrix * localMatrix
    multiplyMatrix4(runtime.worldMatrix, parentRuntime.worldMatrix!, localMatrix);
  } else {
    copyMatrix4(runtime.worldMatrix, localMatrix);
  }

  const localTransformID = runtime.localTransformID;
  const parentWorldTransformID = parentRuntime ? parentRuntime.worldTransformID : 0;
  runtime.worldTransformUsingLocalTransformID = localTransformID;
  runtime.worldTransformUsingParentTransformID = parentWorldTransformID;
  runtime.worldTransformID = (localTransformID << 16) | (parentWorldTransformID & 0xffff);
}
