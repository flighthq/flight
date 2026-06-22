import type { SurfaceMaterial } from './SurfaceMaterial';

// Pass-infrastructure material: outputs linearized view-space depth, used by shadow and
// depth-of-field/velocity passes. `near`/`far` set the linearization range when the material is
// used as a standalone depth-visualization; the depth pass supplies the camera range otherwise.
export interface DepthMaterial extends SurfaceMaterial {
  far: number;
  near: number;
}

export const DepthMaterialKind: unique symbol = Symbol('DepthMaterial');
