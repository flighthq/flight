import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_transmission + KHR_materials_volume: refractive, see-through surfaces with
// volumetric absorption (glass, liquid). Composes the `standard` base block (D4).
// `transmission` is the surface transmission factor [0,1] (with `transmissionMap`); `thickness`
// is the volume thickness in local units (with `thicknessMap`); `attenuationColor` is packed
// sRgb-albedo RGBA tinting transmitted light; `attenuationDistance` is the absorption falloff
// distance; `ior` is the index of refraction.
export interface TransmissionVolumePbrMaterial extends SurfaceMaterial {
  attenuationColor: number;
  attenuationDistance: number;
  ior: number;
  standard: StandardPbrMaterialProperties;
  thickness: number;
  thicknessMap: Texture | null;
  transmission: number;
  transmissionMap: Texture | null;
}

export const TransmissionVolumePbrMaterialKind = 'TransmissionVolumePbrMaterial';
