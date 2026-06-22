import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_clearcoat: a second specular lobe over the base PBR layer (car paint, lacquer).
// Composes the `standard` base block (D4). `clearcoat` is the layer strength [0,1],
// `clearcoatRoughness` its roughness; the maps modulate them and `clearcoatNormalMap` perturbs
// the clearcoat normal independently of the base.
export interface ClearcoatPbrMaterial extends SurfaceMaterial {
  clearcoat: number;
  clearcoatMap: Texture | null;
  clearcoatNormalMap: Texture | null;
  clearcoatRoughness: number;
  clearcoatRoughnessMap: Texture | null;
  standard: StandardPbrMaterialProperties;
}

export const ClearcoatPbrMaterialKind = 'ClearcoatPbrMaterial';
