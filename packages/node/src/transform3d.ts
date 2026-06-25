import { getEntityRuntime } from '@flighthq/entity';
import {
  acquireMatrix4,
  copyMatrix4,
  createMatrix4,
  inverseMatrix4,
  matrix4TransformPoint,
  multiplyMatrix4,
  releaseMatrix4,
} from '@flighthq/geometry';
import type { HasTransform3DRuntime, Matrix4Like, NodeRuntime, Transform3DNode, Vector3Like } from '@flighthq/types';

import { computeNodeWorldTransformRevision } from './revision';

export function convertNodeVector3GlobalToLocal<Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Traits>,
  point: Readonly<Vector3Like>,
): void {
  // Acquire from pool instead of allocating to avoid hot-path GC pressure.
  const inv = acquireMatrix4();
  inverseMatrix4(inv, getNodeWorldTransformMatrix4(source));
  matrix4TransformPoint(out, inv, point);
  releaseMatrix4(inv);
}

export function convertNodeVector3LocalToGlobal<Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Traits>,
  point: Readonly<Vector3Like>,
): void {
  matrix4TransformPoint(out, getNodeWorldTransformMatrix4(source), point);
}

export function ensureNodeWorldTransformMatrix4<Traits extends object>(target: Transform3DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime;
  const parent = runtime.parent as Transform3DNode<Traits> | null;

  let parentRuntime: (NodeRuntime<Traits> & HasTransform3DRuntime) | undefined;
  let parentWorldTransformId = 0;

  if (parent !== null) {
    ensureNodeWorldTransformMatrix4(parent);
    parentRuntime = getEntityRuntime(parent) as NodeRuntime<Traits> & HasTransform3DRuntime;
    parentWorldTransformId = parentRuntime.worldTransformId;
  }

  if (
    runtime.worldTransformUsingLocalTransformId !== runtime.localTransformId ||
    runtime.worldTransformUsingParentTransformId !== parentWorldTransformId
  ) {
    recomputeWorldTransform3D(target, runtime, parentRuntime);
  }
}

export function getNodeWorldTransformMatrix4<Traits extends object>(
  target: Transform3DNode<Traits>,
): Readonly<Matrix4Like> {
  ensureNodeWorldTransformMatrix4(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime).worldMatrix!;
}

function recomputeWorldTransform3D<Traits extends object>(
  target: Transform3DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasTransform3DRuntime,
  parentRuntime?: Readonly<NodeRuntime<Traits> & HasTransform3DRuntime>,
): void {
  if (runtime.worldMatrix === null) {
    runtime.worldMatrix = createMatrix4();
  }

  if (parentRuntime !== undefined) {
    multiplyMatrix4(runtime.worldMatrix, parentRuntime.worldMatrix!, target.localMatrix);
  } else {
    copyMatrix4(runtime.worldMatrix, target.localMatrix);
  }

  computeNodeWorldTransformRevision(runtime, parentRuntime);
}
