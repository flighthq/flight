// Exact compatibility bridge for the five Types-owned contracts that still participate in the
// @flighthq/types public-facade cycle with Scene3D. All other owner dependencies are direct.
export type { Projection } from './Camera3D.ts';
export type { Light } from './Light.ts';
export type { MeshMorph } from './MorphTarget.ts';
export type { Node3D } from './Node3D.ts';
