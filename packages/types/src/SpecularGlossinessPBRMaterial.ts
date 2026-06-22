import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Legacy specular-glossiness PBR workflow (converted to metallic-roughness at bind). `diffuse`
// and `specular` are packed sRgb-albedo RGBA; `glossiness` is the inverse of roughness.
// `specularGlossinessMap` packs specular in RGB and glossiness in A. `emissive`/`emissiveMap`,
// `normalMap`/`normalScale`, and `occlusionMap`/`occlusionStrength` match the standard block.
export interface SpecularGlossinessPbrMaterial extends SurfaceMaterial {
  diffuse: number;
  diffuseMap: Texture | null;
  emissive: number;
  emissiveMap: Texture | null;
  emissiveStrength: number;
  glossiness: number;
  normalMap: Texture | null;
  normalScale: number;
  occlusionMap: Texture | null;
  occlusionStrength: number;
  specular: number;
  specularGlossinessMap: Texture | null;
}

export const SpecularGlossinessPbrMaterialKind: unique symbol = Symbol('SpecularGlossinessPbrMaterial');
