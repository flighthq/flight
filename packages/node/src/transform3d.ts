import { getEntityRuntime } from '@flighthq/entity';
import {
  acquireMatrix4,
  composeMatrix4,
  copyMatrix4,
  copyQuaternion,
  copyVector3,
  createMatrix4,
  decomposeMatrix4,
  inverseMatrix4,
  matrix4TransformPoint,
  multiplyMatrix4,
  releaseMatrix4,
} from '@flighthq/geometry';
import type {
  HasTransform3DRuntime,
  Matrix4Like,
  NodeRuntime,
  Transform3DLike,
  Transform3DNode,
  Vector3Like,
} from '@flighthq/types';

import { computeNodeWorldTransformRevision, invalidateNodeLocalTransform } from './revision';

export function convertNodeVector3GlobalToLocal<Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Traits>,
  point: Readonly<Vector3Like>,
): void {
  // Acquire from pool instead of allocating to avoid hot-path GC pressure.
  const inv = acquireMatrix4();
  inverseMatrix4(inv, getNodeWorldMatrix4(source));
  matrix4TransformPoint(out, inv, point);
  releaseMatrix4(inv);
}

export function convertNodeVector3LocalToGlobal<Traits extends object>(
  out: Vector3Like,
  source: Transform3DNode<Traits>,
  point: Readonly<Vector3Like>,
): void {
  matrix4TransformPoint(out, getNodeWorldMatrix4(source), point);
}

// Ensures the cached local matrix is current. Recomposes it from translation/rotation/scale when the
// local transform is dirty — unless it was set directly (setNodeLocalMatrix4 pre-satisfies the dirty
// check so the detached matrix survives).
export function ensureNodeLocalMatrix4<Traits extends object>(target: Transform3DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime;
  if (runtime.localMatrix4 === null || runtime.localTransformUsingLocalTransformId !== runtime.localTransformId) {
    recomputeLocalTransform3D(target, runtime);
  }
}

export function ensureNodeWorldMatrix4<Traits extends object>(target: Transform3DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime;
  const parent = runtime.parent as Transform3DNode<Traits> | null;

  let parentRuntime: (NodeRuntime<Traits> & HasTransform3DRuntime) | undefined;
  let parentWorldTransformId = 0;

  if (parent !== null) {
    ensureNodeWorldMatrix4(parent);
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

export function getNodeLocalMatrix4<Traits extends object>(target: Transform3DNode<Traits>): Readonly<Matrix4Like> {
  ensureNodeLocalMatrix4(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime).localMatrix4!;
}

// Reads the node's decomposed local transform (translation/rotation/scale) into `out`. When the local
// matrix is detached (set directly), these fields are dormant; call syncNodeTransform3DFromMatrix4
// first to reflect the matrix.
export function getNodeTransform3D<Traits extends object>(out: Transform3DLike, source: Transform3DNode<Traits>): void {
  copyVector3(out.translation, source.translation);
  copyQuaternion(out.rotation, source.rotation);
  copyVector3(out.scale, source.scale);
}

export function getNodeWorldMatrix4<Traits extends object>(target: Transform3DNode<Traits>): Readonly<Matrix4Like> {
  ensureNodeWorldMatrix4(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime).worldMatrix4!;
}

// True when the local matrix was set directly (setNodeLocalMatrix4) and the translation/rotation/scale
// fields have not since been reattached by a TRS write or syncNodeTransform3DFromMatrix4. Diagnostic.
// Resolves the local matrix first so a pending TRS write reports as reattached rather than stale.
export function isNodeLocalMatrix4Detached<Traits extends object>(target: Transform3DNode<Traits>): boolean {
  ensureNodeLocalMatrix4(target);
  return (getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime).localMatrix4Detached;
}

// Sets the node's local matrix directly, bypassing translation/rotation/scale. The matrix is copied
// (the node owns its storage) and marked detached: the TRS fields go dormant and are not recomposed
// over it until a TRS write or syncNodeTransform3DFromMatrix4. Bumps the local transform revision so
// world and render refresh, then pre-satisfies the local recompute so the set matrix survives.
export function setNodeLocalMatrix4<Traits extends object>(
  target: Transform3DNode<Traits>,
  source: Readonly<Matrix4Like>,
): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime;
  if (runtime.localMatrix4 === null) runtime.localMatrix4 = createMatrix4();
  copyMatrix4(runtime.localMatrix4, source);
  invalidateNodeLocalTransform(target);
  runtime.localTransformUsingLocalTransformId = runtime.localTransformId;
  runtime.localMatrix4Detached = true;
}

// Sets the node's local transform from a decomposed carrier, reattaching TRS authoring (clears the
// detached state via the recompute) and rebuilding the matrix cache from the fields.
export function setNodeTransform3D<Traits extends object>(
  target: Transform3DNode<Traits>,
  source: Readonly<Transform3DLike>,
): void {
  copyVector3(target.translation, source.translation);
  copyQuaternion(target.rotation, source.rotation);
  copyVector3(target.scale, source.scale);
  invalidateNodeLocalTransform(target);
}

// Reattaches the TRS fields to a directly-set matrix by decomposing it into translation/rotation/scale
// (best-effort: lossy on shear). Non-destructive — the matrix cache is unchanged and stays authoritative
// until a subsequent TRS write. Clears the detached state.
export function syncNodeTransform3DFromMatrix4<Traits extends object>(target: Transform3DNode<Traits>): void {
  const runtime = getEntityRuntime(target) as NodeRuntime<Traits> & HasTransform3DRuntime;
  ensureNodeLocalMatrix4(target);
  decomposeMatrix4(target.translation, target.rotation, target.scale, runtime.localMatrix4!);
  runtime.localMatrix4Detached = false;
}

function recomputeLocalTransform3D<Traits extends object>(
  target: Transform3DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasTransform3DRuntime,
): void {
  if (runtime.localMatrix4 === null) runtime.localMatrix4 = createMatrix4();
  composeMatrix4(runtime.localMatrix4, target.translation, target.rotation, target.scale);
  runtime.localMatrix4Detached = false;
  runtime.localTransformUsingLocalTransformId = runtime.localTransformId;
}

function recomputeWorldTransform3D<Traits extends object>(
  target: Transform3DNode<Traits>,
  runtime: NodeRuntime<Traits> & HasTransform3DRuntime,
  parentRuntime?: Readonly<NodeRuntime<Traits> & HasTransform3DRuntime>,
): void {
  if (runtime.worldMatrix4 === null) {
    runtime.worldMatrix4 = createMatrix4();
  }
  ensureNodeLocalMatrix4(target);

  if (parentRuntime !== undefined) {
    multiplyMatrix4(runtime.worldMatrix4, parentRuntime.worldMatrix4!, runtime.localMatrix4!);
  } else {
    copyMatrix4(runtime.worldMatrix4, runtime.localMatrix4!);
  }

  computeNodeWorldTransformRevision(runtime, parentRuntime);
}
