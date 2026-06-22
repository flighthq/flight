import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Self-illuminating, lighting-independent. `emissive` is packed sRgb-albedo RGBA, `emissiveMap`
// modulates it, and `emissiveStrength` scales linear radiance — values > 1 drive bloom on GPU
// backends. Full fidelity on every backend.
export interface EmissiveMaterial extends SurfaceMaterial {
  emissive: number;
  emissiveMap: Texture | null;
  emissiveStrength: number;
}

export const EmissiveMaterialKind: unique symbol = Symbol('EmissiveMaterial');
