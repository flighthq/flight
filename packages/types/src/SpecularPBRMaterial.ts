import type { StandardPbrMaterialProperties } from './StandardPBRMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_specular: independent control of the dielectric specular reflection strength
// and tint. Composes the `standard` base block (D4). `specular` scales the specular reflection
// [0,1] (with `specularMap` in its alpha); `specularColor` is packed sRgb-albedo RGBA tinting
// the F0 reflectance (with `specularColorMap`).
export interface SpecularPbrMaterial extends SurfaceMaterial {
  specular: number;
  specularColor: number;
  specularColorMap: Texture | null;
  specularMap: Texture | null;
  standard: StandardPbrMaterialProperties;
}

export const SpecularPbrMaterialKind: unique symbol = Symbol('SpecularPbrMaterial');
