import type { Material3D } from '@flighthq/materials/contract';
import type { MeshGeometry } from '@flighthq/meshgeometry/contract';

import type { Node3D, Node3DRuntime } from './Node3D.ts';

export const BillboardKind = 'Billboard';

export type BillboardMode = 'axisY' | 'full' | 'screenAligned';

export interface Billboard extends Node3D {
  geometry: MeshGeometry;
  materials: (Material3D | null)[];
  mode: BillboardMode;
}

export type BillboardRuntime = Node3DRuntime;
