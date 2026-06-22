import type {
  SpecularGlossinessPbrMaterial,
  StandardPbrMaterial,
  StandardPbrMaterialProperties,
} from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types';

import { createSurfaceMaterial } from './surfaceMaterial';

// Legacy specular-glossiness PBR material (converted to metallic-roughness at bind). `diffuse`
// defaults to white, `specular` to white, `glossiness` to 1, `emissive` to opaque black,
// `emissiveStrength` to 1, `normalScale`/`occlusionStrength` to 1, all maps to null.
export function createSpecularGlossinessPbrMaterial(
  opts?: Readonly<Partial<SpecularGlossinessPbrMaterial>>,
): SpecularGlossinessPbrMaterial {
  const material = createSurfaceMaterial(SpecularGlossinessPbrMaterialKind) as SpecularGlossinessPbrMaterial;
  material.diffuse = opts?.diffuse ?? 0xffffffff;
  material.diffuseMap = opts?.diffuseMap ?? null;
  material.emissive = opts?.emissive ?? 0x000000ff;
  material.emissiveMap = opts?.emissiveMap ?? null;
  material.emissiveStrength = opts?.emissiveStrength ?? 1;
  material.glossiness = opts?.glossiness ?? 1;
  material.normalMap = opts?.normalMap ?? null;
  material.normalScale = opts?.normalScale ?? 1;
  material.occlusionMap = opts?.occlusionMap ?? null;
  material.occlusionStrength = opts?.occlusionStrength ?? 1;
  material.specular = opts?.specular ?? 0xffffffff;
  material.specularGlossinessMap = opts?.specularGlossinessMap ?? null;
  return material;
}

// Core glTF metallic-roughness PBR material. Defaults: white `baseColor`, fully dielectric
// (`metallic` 0) and fully rough (`roughness` 1), opaque-black `emissive` at unit strength,
// unit `normalScale`/`occlusionStrength`, all maps null.
export function createStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  const material = createSurfaceMaterial(StandardPbrMaterialKind) as StandardPbrMaterial;
  assignStandardPbrMaterialProperties(material, opts);
  return material;
}

// Builds the reusable StandardPbrMaterialProperties block that PBR-extension materials compose
// into their `standard` field (D4). Same defaults as createStandardPbrMaterial, without a kind
// or the surface trailer.
export function createStandardPbrMaterialProperties(
  opts?: Readonly<Partial<StandardPbrMaterialProperties>>,
): StandardPbrMaterialProperties {
  const properties = {} as StandardPbrMaterialProperties;
  assignStandardPbrMaterialProperties(properties, opts);
  return properties;
}

// Writes the metallic-roughness property defaults (overridden by `opts`) onto `target`. Shared
// by the StandardPbrMaterial constructor and the standalone property-block constructor.
function assignStandardPbrMaterialProperties(
  target: StandardPbrMaterialProperties,
  opts?: Readonly<Partial<StandardPbrMaterialProperties>>,
): void {
  target.baseColor = opts?.baseColor ?? 0xffffffff;
  target.baseColorMap = opts?.baseColorMap ?? null;
  target.emissive = opts?.emissive ?? 0x000000ff;
  target.emissiveMap = opts?.emissiveMap ?? null;
  target.emissiveStrength = opts?.emissiveStrength ?? 1;
  target.metallic = opts?.metallic ?? 0;
  target.metallicRoughnessMap = opts?.metallicRoughnessMap ?? null;
  target.normalMap = opts?.normalMap ?? null;
  target.normalScale = opts?.normalScale ?? 1;
  target.occlusionMap = opts?.occlusionMap ?? null;
  target.occlusionStrength = opts?.occlusionStrength ?? 1;
  target.roughness = opts?.roughness ?? 1;
}
