import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// The metallic-roughness PBR field-block shared by StandardPbrMaterial and composed (not
// inherited) by every PBR-extension material as their `standard` block (D4). Pure descriptor
// fields, no `kind` and no trailer. `baseColor`/`emissive` are packed sRgb-albedo RGBA;
// metallic-roughness, normal, and occlusion maps are linear data. `occlusionStrength` and
// `normalScale` scale their map contributions; `emissiveStrength` > 1 drives bloom.
export interface StandardPbrMaterialProperties {
  baseColor: number;
  baseColorMap: Texture | null;
  emissive: number;
  emissiveMap: Texture | null;
  emissiveStrength: number;
  metallic: number;
  metallicRoughnessMap: Texture | null;
  normalMap: Texture | null;
  normalScale: number;
  occlusionMap: Texture | null;
  occlusionStrength: number;
  roughness: number;
}

// Core glTF metallic-roughness PBR material: the StandardPbrMaterialProperties block plus the
// shared surface trailer and its kind.
export interface StandardPbrMaterial extends SurfaceMaterial, StandardPbrMaterialProperties {}

export const StandardPbrMaterialKind: unique symbol = Symbol('StandardPbrMaterial');
