// Exact compatibility bridge for the contracts that still participate in the @flighthq/types
// public-facade cycle with Scene3D. Owner dependencies remain direct.
export type { Projection } from '@flighthq/camera/contract';
export type { Light } from './Light.ts';
export type { MeshMorph } from '@flighthq/meshgeometry/contract';
export type { Node3D } from '@flighthq/scene3d/contract';
