import type { Material } from './Material';
import type { Matrix4 } from './Matrix4';
import type { MeshGeometry } from './MeshGeometry';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';
export interface InstancedMesh extends SceneNode {
  geometry: MeshGeometry;
  instanceColors: Uint32Array<ArrayBuffer> | null;
  instanceCount: number;
  instanceMatrices: Matrix4[];
  materials: (Material | null)[];
}
export type InstancedMeshRuntime = SceneNodeRuntime;
export const InstancedMeshKind = 'InstancedMesh';
