import type { Material3D } from './Material3D';
import type { MeshGeometry } from './MeshGeometry';
import type { Node3D, Node3DRuntime } from './Node3D';
export type BillboardMode = 'axisY' | 'full' | 'screenAligned';
export interface Billboard extends Node3D {
  geometry: MeshGeometry;
  materials: (Material3D | null)[];
  mode: BillboardMode;
}
export type BillboardRuntime = Node3DRuntime;
export const BillboardKind = 'Billboard';
