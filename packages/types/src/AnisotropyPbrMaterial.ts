import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_anisotropy: a directionally-stretched specular lobe (brushed metal, hair).
// Requires mesh tangents. Composes the `standard` base block (D4). `anisotropyStrength` is the
// lobe stretch [0,1], `anisotropyRotation` rotates the tangent-space direction (radians), and
// `anisotropyMap` supplies a per-texel direction + strength.
export interface AnisotropyPbrMaterial extends SurfaceMaterial {
  anisotropyMap: Texture | null;
  anisotropyRotation: number;
  anisotropyStrength: number;
  standard: StandardPbrMaterialProperties;
}

export const AnisotropyPbrMaterialKind = 'AnisotropyPbrMaterial';
