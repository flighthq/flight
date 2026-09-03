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
export type InstancedMeshRuntime = Node3DRuntime;
export const InstancedMeshKind = 'InstancedMesh';
