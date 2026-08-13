import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// The metallic-roughness PBR field-block shared by StandardPbrMaterial and composed (not
// inherited) by every PBR-extension material as their `standard` block (D4). Pure descriptor
// fields, no `kind` and no trailer. `baseColor`/`emissive` are packed sRgb-albedo RGBA;
// metallic-roughness, normal, occlusion, and alpha maps are linear data. `occlusionStrength` and
// `normalScale` scale their map contributions; `emissiveStrength` > 1 drives bloom. `alphaMap` is
// a dedicated coverage texture whose green channel multiplies the final alpha (separate from
// `baseColorMap`'s own alpha); it takes effect only when `alphaMode` is 'blend' or 'mask'.
export interface StandardPbrMaterialProperties {
  alphaMap: Texture | null;
  // Packed sRGB RGBA (`0xRRGGBBAA`), decoded to linear by the backend material renderer. Default 0xffffffff.
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

export const StandardPbrMaterialKind = 'StandardPbrMaterial';
