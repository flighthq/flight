import type { Aabb } from './Aabb';
import type { InstancedMeshSignals } from './InstancedMeshSignals';
import type { Material } from './Material';
import type { Matrix4 } from './Matrix4';
import type { MeshGeometry } from './MeshGeometry';
import type { Node3D, Node3DRuntime } from './Node3D';
export interface InstancedMesh extends Node3D {
  geometry: MeshGeometry;
  instanceColors: Uint32Array<ArrayBuffer> | null;
  instanceCount: number;
  instanceMatrices: Matrix4[];
  materials: (Material | null)[];
  version: number;
}
// The cull subsystem's slot on the InstancedMesh node runtime. `instanceLocalBounds` is the union, in
// the node's own local space, of the geometry bounds transformed by every live per-instance matrix —
// the box a frustum cull must test, because an instance is drawn at `worldMatrix * instanceMatrix` and
// the per-instance matrix routinely carries the bulk of the placement (a stack of props rising in Y, a
// model's authoring scale). Testing the bare geometry bounds at the node origin describes ONE instance
// sitting on the node, so a spread-out batch is culled while fully in view.
//
// It lives on the NODE runtime rather than the geometry runtime because the union is a function of the
// geometry AND this node's instance matrices — two InstancedMeshes may share one geometry with entirely
// different placements, and a geometry-level slot would thrash between them.
//
// `instanceLocalBoundsVersion` is the InstancedMesh `version` the cached union was built from, so the
// cull recomputes only when the instance payload actually changed (the versioned-payload half of the
// invalidation doctrine). Null (or absent) means nothing has computed it yet.
export interface InstancedMeshCullRuntime {
  instanceLocalBounds?: Aabb | null;
  instanceLocalBoundsVersion?: number;
}

// The signal group's slot on the InstancedMesh node runtime, null until enableInstancedMeshSignals
// creates it — the same runtime-slot shape enableNodeSignals uses for NodeSignals, so an unobserved
// batch carries no signal objects.
export interface InstancedMeshSignalsRuntime {
  instancedMeshSignals?: InstancedMeshSignals | null;
}

export type InstancedMeshRuntime = Node3DRuntime & InstancedMeshCullRuntime & InstancedMeshSignalsRuntime;
export const InstancedMeshKind = 'InstancedMesh';
