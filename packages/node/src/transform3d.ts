import { getEntityRuntime } from '@flighthq/entity';
import { copyMatrix4, createMatrix4, inverseMatrix4, matrix4TransformPoint, multiplyMatrix4 } from '@flighthq/geometry';
import type { HasTransform3DRuntime, Matrix4Like, NodeRuntime, Transform3DNode, Vector3Like } from '@flighthq/types';

import { computeNodeWorldTransformRevision } from './revision';

export function convertNodeVector3GlobalToLocal<Kind extends symbol, Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Kind, Traits>,
  point: Readonly<Vector3Like>,
): void {
  const inv = createMatrix4();
  inverseMatrix4(inv, getNodeWorldTransformMatrix4(source));
  matrix4TransformPoint(out, inv, point);
}

export function convertNodeVector3LocalToGlobal<Kind extends symbol, Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Kind, Traits>,
  point: Readonly<Vector3Like>,
): void {
  matrix4TransformPoint(out, getNodeWorldTransformMatrix4(source), point);
}

export function ensureNodeWorldTransformMatrix4<Kind extends symbol, Traits extends object>(
  target: Transform3DNode<Kind, Traits>,
): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Kind, Traits> & HasTransform3DRuntime;
  const parent = runtime.parent as Transform3DNode<Kind, Traits> | null;

  let parentRuntime: (NodeRuntime<Kind, Traits> & HasTransform3DRuntime) | undefined;
  let parentWorldTransformID = 0;

  if (parent !== null) {
    ensureNodeWorldTransformMatrix4(parent);
    parentRuntime = getEntityRuntime(parent) as NodeRuntime<Kind, Traits> & HasTransform3DRuntime;
    parentWorldTransformID = parentRuntime.worldTransformID;
  }

  if (
    runtime.worldTransformUsingLocalTransformID !== runtime.localTransformID ||
    runtime.worldTransformUsingParentTransformID !== parentWorldTransformID
  ) {
    recomputeWorldTransform3D(target, runtime, parentRuntime);
  }
}

export function getNodeWorldTransformMatrix4<Kind extends symbol, Traits extends object>(
  target: Transform3DNode<Kind, Traits>,
): Readonly<Matrix4Like> {
  ensureNodeWorldTransformMatrix4(target);
  return (getEntityRuntime(target) as NodeRuntime<Kind, Traits> & HasTransform3DRuntime).worldMatrix!;
}

function recomputeWorldTransform3D<Kind extends symbol, Traits extends object>(
  target: Transform3DNode<Kind, Traits>,
  runtime: NodeRuntime<Kind, Traits> & HasTransform3DRuntime,
  parentRuntime?: Readonly<NodeRuntime<Kind, Traits> & HasTransform3DRuntime>,
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
