import type {
  SpecularGlossinessPbrMaterial,
  StandardPbrMaterial,
  StandardPbrMaterialProperties,
} from '@flighthq/types';
import { SpecularGlossinessPbrMaterialKind, StandardPbrMaterialKind } from '@flighthq/types';

import { unpackColorToLinear } from './color';
import { createSurfaceMaterial } from './surfaceMaterial';

// Converts a legacy specular-glossiness material to a metallic-roughness property block.
// Writes `out` with the computed base-color, metallic, and roughness values. The conversion
// is the canonical KHR_materials_pbrSpecularGlossiness → metallic-roughness approximation:
//   roughness  = 1 - glossiness
//   metallic   = max(specularLinear) above the dielectric threshold (~ 0.04 F0)
//   baseColor  = blend of diffuse and inferred albedo based on metallic estimate
// Lossiness: the conversion is an approximation — metal/dielectric separation derived from
// the specular luma cannot fully recover the original material on every surface. Document
// the approximation when surfacing the output to users.
// Map assignments: diffuseMap → baseColorMap; specularGlossinessMap → metallicRoughnessMap
// (packing semantics differ — the renderer must remap channels). normalMap, occlusionMap,
// emissiveMap, normalScale, occlusionStrength, and emissiveStrength are forwarded unchanged.
export function convertSpecularGlossinessToStandardPbr(
  out: StandardPbrMaterialProperties,
  source: Readonly<SpecularGlossinessPbrMaterial>,
): void {
  // Read all input values into locals before writing (alias-safe).
  const diffuse = source.diffuse;
  const specular = source.specular;
  const glossiness = source.glossiness;
  const diffuseMap = source.diffuseMap;
  const specularGlossinessMap = source.specularGlossinessMap;
  const emissive = source.emissive;
  const emissiveMap = source.emissiveMap;
  const emissiveStrength = source.emissiveStrength;
  const normalMap = source.normalMap;
  const normalScale = source.normalScale;
  const occlusionMap = source.occlusionMap;
  const occlusionStrength = source.occlusionStrength;
  // Unpack the specular color to linear to compute F0 luminance for the metallic estimate.
  const specLinear = scratchLinear;
  unpackColorToLinear(specLinear, specular);
  const specR = specLinear[0];
  const specG = specLinear[1];
  const specB = specLinear[2];
  // Perceived luminance of the specular F0 (Rec. 709 weights).
  const specLuma = 0.2126 * specR + 0.7152 * specG + 0.0722 * specB;
  // The dielectric F0 threshold: ~0.04 (4% reflectance). A specular luma above this is
  // characteristic of metallic response; we map linearly from 0 → 1.
  const DIELECTRIC_F0 = 0.04;
  const metallic = Math.min(1, Math.max(0, (specLuma - DIELECTRIC_F0) / (1 - DIELECTRIC_F0)));
  // Base color: for metals the diffuse is the albedo; for dielectrics it is the diffuse.
  // Blend: baseColor = lerp(diffuse * (1 - specLuma), diffuse, metallic).
  const diffLinear = scratchLinear2;
  unpackColorToLinear(diffLinear, diffuse);
  const diffR = diffLinear[0];
  const diffG = diffLinear[1];
  const diffB = diffLinear[2];
  const diffA = diffLinear[3];
  // Approximate base color in linear, then repack to sRGB RGBA.
  const baseR = diffR * (1 - specLuma * (1 - metallic));
  const baseG = diffG * (1 - specLuma * (1 - metallic));
  const baseB = diffB * (1 - specLuma * (1 - metallic));
  const baseColor = packLinear(baseR, baseG, baseB, diffA);
  out.baseColor = baseColor;
  out.baseColorMap = diffuseMap;
  out.emissive = emissive;
  out.emissiveMap = emissiveMap;
  out.emissiveStrength = emissiveStrength;
  out.metallic = metallic;
  out.metallicRoughnessMap = specularGlossinessMap;
  out.normalMap = normalMap;
  out.normalScale = normalScale;
  out.occlusionMap = occlusionMap;
  out.occlusionStrength = occlusionStrength;
  out.roughness = 1 - glossiness;
}

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

// IEC 61966-2-1 inverse OETF for a single linear channel in [0, 1] → 8-bit sRGB.
function linearChannelToSrgb8(value: number): number {
  const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, srgb)) * 0xff);
}

// Pack four linear [0,1] channels back to a 0xRRGGBBAA packed sRGB integer.
function packLinear(r: number, g: number, b: number, a: number): number {
  return (
    ((linearChannelToSrgb8(r) << 24) |
      (linearChannelToSrgb8(g) << 16) |
      (linearChannelToSrgb8(b) << 8) |
      Math.round(a * 0xff)) >>>
    0
  );
}

const scratchLinear: [number, number, number, number] = [0, 0, 0, 0];
const scratchLinear2: [number, number, number, number] = [0, 0, 0, 0];
