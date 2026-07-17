import { getColorLuminance } from '@flighthq/color';
import type { PhongMaterial, StandardPbrMaterial, StandardPbrMaterialProperties } from '@flighthq/types';

import { createStandardPbrMaterial } from './pbrMaterials';

// Migrates a classic `PhongMaterial` to a metallic-roughness `StandardPbrMaterial` whose surface
// reads equivalently. A reference (not exact) mapping: the Phong reflection-vector lobe and the
// GGX microfacet lobe cannot match at every angle, so this preserves overall appearance —
// base color, gloss, and brightness — rather than per-highlight shape. `opts` overrides any mapped
// field (e.g. to force `metallic`). Diffuse and baseColor share the packed sRgb-albedo encoding,
// so the color transfers unchanged; the renderer decodes both identically.
//
// IMPORTANT — brightness: the metallic-roughness diffuse term divides albedo by π that classic
// Phong does not (see `getPhongToPbrLightExposure`). The material alone cannot compensate a
// per-light normalization, so scale the scene's light intensity by that exposure or a migrated
// scene renders ~π× (≈3.2×) too dark.
export function convertPhongToStandardPbrMaterial(
  phong: Readonly<PhongMaterial>,
  opts?: Readonly<Partial<StandardPbrMaterialProperties>>,
): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: phong.diffuse,
    baseColorMap: phong.diffuseMap,
    metallic: getPbrMetallicFromPhongSpecular(phong.specular, phong.diffuse),
    normalMap: phong.normalMap,
    normalScale: phong.normalScale,
    roughness: getPbrRoughnessFromPhongShininess(phong.shininess),
    ...opts,
  });
}

// Reference metallic guess from a Phong specular/diffuse pair. Phong does not encode metalness, so
// this is conservative: dielectric (0) unless a strong specular sits over a near-black diffuse — the
// only Phong configuration that reads unambiguously metallic. Callers that know the material is
// metal should pass `metallic` through `convertPhongToStandardPbrMaterial`'s `opts` instead.
export function getPbrMetallicFromPhongSpecular(specular: number, diffuse: number): number {
  return getColorLuminance(specular) > 0.5 && getColorLuminance(diffuse) < 0.04 ? 1 : 0;
}

// Maps a Blinn-Phong specular exponent to a GGX roughness via `sqrt(2 / (shininess + 2))`, clamped
// to [0, 1]. Monotonic: higher shininess (sharper highlight) → lower roughness (smoother surface).
// The Phong default shininess of 32 maps to roughness ≈ 0.243.
export function getPbrRoughnessFromPhongShininess(shininess: number): number {
  return Math.min(1, Math.max(0, Math.sqrt(2 / (Math.max(0, shininess) + 2))));
}

// The exposure (in EV) to apply to a scene's lights when migrating classic-Phong materials to
// metallic-roughness PBR, so brightness is preserved under the same lights. The PBR diffuse BRDF
// divides albedo by π for energy conservation while classic Phong does not, so PBR diffuse is ~1/π
// as bright for equal light radiance. This returns `log2(π)` (≈ 1.651 EV) — i.e. a ×π scale —
// applied via `applyLightExposure(intensity, getPhongToPbrLightExposure())` from `@flighthq/lighting`.
// Skipping it is the classic "ported scene is far too dark" failure.
//
// Assumed input, so it is applied exactly ONCE: light intensities already in Flight's LINEAR-radiance
// Phong convention. This is the single Phong→PBR energy step; it is NOT a general "engine porting"
// scale. Porting from a foreign engine whose lights are in a different space (e.g. a gamma-space LDR
// source) is a separate, earlier conversion into Flight's linear Phong convention that belongs in the
// importer, not here — do not fold that engine's own boost into this π, and do not apply this twice.
export function getPhongToPbrLightExposure(): number {
  return Math.log2(Math.PI);
}
