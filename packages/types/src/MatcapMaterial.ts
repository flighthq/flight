import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Material-capture shading: a prebaked lit sphere sampled by the view-space normal, giving full
// stylized "lighting" with no scene lights. `matcap` is the capture texture; `tint` is a packed
// sRgb-albedo RGBA multiplier. Lighting-independent, so full fidelity on every backend.
export interface MatcapMaterial extends SurfaceMaterial {
  matcap: Texture | null;
  tint: number;
}

export const MatcapMaterialKind: unique symbol = Symbol('MatcapMaterial');
