import type { Mesh } from './Mesh';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';
export interface LodLevel {
  mesh: Mesh;
  minDistance: number;
}
export interface LodMesh extends SceneNode {
  activeLevelIndex: number;
  levels: readonly LodLevel[];
}
export type LodMeshRuntime = SceneNodeRuntime;
export const LodMeshKind = 'LodMesh';
