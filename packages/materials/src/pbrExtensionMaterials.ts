import type {
  AnisotropyPbrMaterial,
  ClearcoatPbrMaterial,
  IridescencePbrMaterial,
  SheenPbrMaterial,
  SpecularPbrMaterial,
  SubsurfacePbrMaterial,
  TransmissionVolumePbrMaterial,
} from '@flighthq/types';
import {
  AnisotropyPbrMaterialKind,
  ClearcoatPbrMaterialKind,
  IridescencePbrMaterialKind,
  SheenPbrMaterialKind,
  SpecularPbrMaterialKind,
  SubsurfacePbrMaterialKind,
  TransmissionVolumePbrMaterialKind,
} from '@flighthq/types';

import { createStandardPbrMaterialProperties } from './pbrMaterials';
import { createSurfaceMaterial } from './surfaceMaterial';

// KHR_materials_anisotropy: a directionally-stretched specular lobe. `anisotropyStrength`
// defaults to 0 (isotropic), `anisotropyRotation` to 0, the map to null. Composes a default
// `standard` block.
export function createAnisotropyPbrMaterial(opts?: Readonly<Partial<AnisotropyPbrMaterial>>): AnisotropyPbrMaterial {
  const material = createSurfaceMaterial(AnisotropyPbrMaterialKind) as AnisotropyPbrMaterial;
  material.anisotropyMap = opts?.anisotropyMap ?? null;
  material.anisotropyRotation = opts?.anisotropyRotation ?? 0;
  material.anisotropyStrength = opts?.anisotropyStrength ?? 0;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}

// KHR_materials_clearcoat: a second specular lobe over the base PBR layer. `clearcoat` defaults
// to 0 (disabled), `clearcoatRoughness` to 0, all maps to null. Composes a default `standard`
// block.
export function createClearcoatPbrMaterial(opts?: Readonly<Partial<ClearcoatPbrMaterial>>): ClearcoatPbrMaterial {
  const material = createSurfaceMaterial(ClearcoatPbrMaterialKind) as ClearcoatPbrMaterial;
  material.clearcoat = opts?.clearcoat ?? 0;
  material.clearcoatMap = opts?.clearcoatMap ?? null;
  material.clearcoatNormalMap = opts?.clearcoatNormalMap ?? null;
  material.clearcoatRoughness = opts?.clearcoatRoughness ?? 0;
  material.clearcoatRoughnessMap = opts?.clearcoatRoughnessMap ?? null;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}

// KHR_materials_iridescence: thin-film interference. `iridescence` defaults to 0 (disabled),
// `iridescenceIor` to 1.3, the thickness range to glTF's 100–400 nm, all maps to null.
// Composes a default `standard` block.
export function createIridescencePbrMaterial(opts?: Readonly<Partial<IridescencePbrMaterial>>): IridescencePbrMaterial {
  const material = createSurfaceMaterial(IridescencePbrMaterialKind) as IridescencePbrMaterial;
  material.iridescence = opts?.iridescence ?? 0;
  material.iridescenceIor = opts?.iridescenceIor ?? 1.3;
  material.iridescenceMap = opts?.iridescenceMap ?? null;
  material.iridescenceThicknessMap = opts?.iridescenceThicknessMap ?? null;
  material.iridescenceThicknessMax = opts?.iridescenceThicknessMax ?? 400;
  material.iridescenceThicknessMin = opts?.iridescenceThicknessMin ?? 100;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}

// KHR_materials_sheen: a retroreflective cloth/fabric lobe. `sheenColor` defaults to opaque
// black (disabled), `sheenRoughness` to 0, maps to null. Composes a default `standard` block.
export function createSheenPbrMaterial(opts?: Readonly<Partial<SheenPbrMaterial>>): SheenPbrMaterial {
  const material = createSurfaceMaterial(SheenPbrMaterialKind) as SheenPbrMaterial;
  material.sheenColor = opts?.sheenColor ?? 0x000000ff;
  material.sheenColorMap = opts?.sheenColorMap ?? null;
  material.sheenRoughness = opts?.sheenRoughness ?? 0;
  material.sheenRoughnessMap = opts?.sheenRoughnessMap ?? null;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}

// KHR_materials_specular: independent dielectric specular strength and tint. `specular` defaults
// to 1 (full), `specularColor` to white, maps to null. Composes a default `standard` block.
export function createSpecularPbrMaterial(opts?: Readonly<Partial<SpecularPbrMaterial>>): SpecularPbrMaterial {
  const material = createSurfaceMaterial(SpecularPbrMaterialKind) as SpecularPbrMaterial;
  material.specular = opts?.specular ?? 1;
  material.specularColor = opts?.specularColor ?? 0xffffffff;
  material.specularColorMap = opts?.specularColorMap ?? null;
  material.specularMap = opts?.specularMap ?? null;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}

// Flight subsurface-scattering extension (wrapped-diffuse approximation). `subsurface` defaults
// to 0 (disabled), `subsurfaceColor` to white, `thickness` to 0, maps to null. Composes a
// default `standard` block.
export function createSubsurfacePbrMaterial(opts?: Readonly<Partial<SubsurfacePbrMaterial>>): SubsurfacePbrMaterial {
  const material = createSurfaceMaterial(SubsurfacePbrMaterialKind) as SubsurfacePbrMaterial;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  material.subsurface = opts?.subsurface ?? 0;
  material.subsurfaceColor = opts?.subsurfaceColor ?? 0xffffffff;
  material.subsurfaceMap = opts?.subsurfaceMap ?? null;
  material.thickness = opts?.thickness ?? 0;
  material.thicknessMap = opts?.thicknessMap ?? null;
  return material;
}

// KHR_materials_transmission + KHR_materials_volume: refractive, see-through surfaces.
// `transmission` defaults to 0 (opaque), `thickness` to 0, `attenuationColor` to white,
// `attenuationDistance` to Infinity (no absorption), `ior` to glTF's 1.5, maps to null.
// Composes a default `standard` block.
export function createTransmissionVolumePbrMaterial(
  opts?: Readonly<Partial<TransmissionVolumePbrMaterial>>,
): TransmissionVolumePbrMaterial {
  const material = createSurfaceMaterial(TransmissionVolumePbrMaterialKind) as TransmissionVolumePbrMaterial;
  material.attenuationColor = opts?.attenuationColor ?? 0xffffffff;
  material.attenuationDistance = opts?.attenuationDistance ?? Infinity;
  material.ior = opts?.ior ?? 1.5;
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  material.thickness = opts?.thickness ?? 0;
  material.thicknessMap = opts?.thicknessMap ?? null;
  material.transmission = opts?.transmission ?? 0;
  material.transmissionMap = opts?.transmissionMap ?? null;
  return material;
}
