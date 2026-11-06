import type { Mesh } from '@flighthq/meshgeometry/contract';
import type { Node3D, Node3DRuntime } from '@flighthq/scene3d/contract';
export interface LodLevel {
  mesh: Mesh;
  minDistance: number;
}
export interface LodMesh extends Node3D {
  activeLevelIndex: number;
  levels: readonly LodLevel[];
}
export type LodMeshRuntime = Node3DRuntime;
export const LodMeshKind = 'LodMesh';
