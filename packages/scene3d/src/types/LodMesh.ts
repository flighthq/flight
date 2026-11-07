import type { Mesh } from '@flighthq/meshgeometry/contract';

import type { Node3D, Node3DRuntime } from './Node3D.ts';

export const LodMeshKind = 'LodMesh';

export interface LodLevel {
  mesh: Mesh;
  minDistance: number;
}

export interface LodMesh extends Node3D {
  activeLevelIndex: number;
  levels: readonly LodLevel[];
}

export type LodMeshRuntime = Node3DRuntime;
