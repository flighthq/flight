import type { Mesh } from './Mesh';
import type { Vector3 } from './Vector3';
export interface SceneRaycastHit {
  distance: number;
  node: Mesh;
  normal: Vector3 | null;
  point: Vector3;
  subsetIndex: number;
  triangleIndex: number;
}
