import type { Material } from './Material';
import type { MeshGeometry } from './MeshGeometry';
import type { SceneNode, SceneNodeRuntime } from './SceneNode';
export type BillboardMode = 'axisY' | 'full' | 'screenAligned';
export interface Billboard extends SceneNode {
  geometry: MeshGeometry;
  materials: (Material | null)[];
  mode: BillboardMode;
}
export type BillboardRuntime = SceneNodeRuntime;
export const BillboardKind = 'Billboard';
