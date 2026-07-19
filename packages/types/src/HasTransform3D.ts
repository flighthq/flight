import type { EntityRuntime } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { Node, NodeTraits } from './Node';
import type { Quaternion } from './Quaternion';
import type { Vector3 } from './Vector3';

// The scene node's authored local transform is decomposed position/rotation/scale. The local matrix
// is a runtime cache composed from these (see `localMatrix4`), or set directly as an escape hatch
// (see `localMatrix4Detached`). Mirrors the 2D `HasTransform2D` split of authored fields + cached
// matrix; `rotation` is a unit quaternion (no euler-order ambiguity). `position` matches the geometry
// compose API (`composeMatrix4(out, position, …)`) and the Unity/three authoring name.
export interface HasTransform3D {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
}

export interface HasTransform3DRuntime extends EntityRuntime {
  // Cached local matrix. Composed from translation/rotation/scale unless `localMatrix4Detached`.
  localMatrix4: Matrix4 | null;
  // True when the local matrix was set directly (setNodeLocalMatrix4), detaching it from the TRS
  // fields — the fields are then dormant (possibly stale) until a TRS write or a sync reattaches
  // them. Diagnostic only; correctness rides on the transform revision counters.
  localMatrix4Detached: boolean;
  worldMatrix4: Matrix4 | null;
}

export type Transform3DNode<Traits extends object = NodeTraits> = Node<Traits> & HasTransform3D;
