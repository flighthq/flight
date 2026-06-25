import type { StandardPbrMaterialProperties } from '@flighthq/types';

// Clamps all metallic-roughness scalar fields of a StandardPbrMaterialProperties block to
// their physically-valid ranges in place. Writes directly to `out`:
//   - `metallic`          → [0, 1]
//   - `roughness`         → [0, 1]
//   - `occlusionStrength` → [0, 1]
//   - `emissiveStrength`  → [0, ∞) (clamps below 0 only; no upper bound for HDR emissive)
//   - `normalScale`       → [0, ∞) (clamps below 0 only)
// Map references and the `baseColor`/`emissive` packed-int colors are not modified —
// those are validated by the caller (map handles come from the resource system; packed
// colors use the full 0xRRGGBBAA range). Returns `out` for chaining.
export function clampStandardPbrMaterialProperties(out: StandardPbrMaterialProperties): StandardPbrMaterialProperties {
  out.metallic = Math.min(1, Math.max(0, out.metallic));
  out.roughness = Math.min(1, Math.max(0, out.roughness));
  out.occlusionStrength = Math.min(1, Math.max(0, out.occlusionStrength));
  out.emissiveStrength = Math.max(0, out.emissiveStrength);
  out.normalScale = Math.max(0, out.normalScale);
  return out;
}

// Returns true when `value` is in the clearcoat range [0, 1]. glTF KHR_materials_clearcoat
// defines `clearcoatFactor` as a linear weight in [0, 1]; values outside this range are invalid.
// Returns false for NaN, Infinity, and out-of-range values. Does not throw.
export function isValidMaterialClearcoat(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

// Returns true when `value` is a physically-valid IOR (index of refraction) — i.e. a finite
// number in [1.0, 5.0]. Values outside this range are not meaningful for standard dielectric
// BRDF models (the glTF KHR_materials_transmission / KHR_materials_ior specs both gate on IOR ≥ 1).
// Returns false for NaN, Infinity, and out-of-range values. Does not throw.
export function isValidMaterialIor(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_MATERIAL_IOR && value <= MAX_MATERIAL_IOR;
}

// Returns true when `value` is a valid iridescence-layer thickness in nanometers. The glTF
// KHR_materials_iridescence spec requires thickness ≥ 0 nm; the standard display range
// (thin-film interference) is [0, 1000] nm. Values above 1000 are physically unusual (no
// observable iridescence). Returns false for negative, NaN, and Infinite values. Does not throw.
export function isValidMaterialIridescenceThickness(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

// Returns true when `value` is a valid normalized weight in [0, 1] — used for transmission,
// sheen strength, anisotropy strength, and other parameters that represent a fractional blend
// or strength factor. Returns false for NaN, Infinity, and out-of-range values. Does not throw.
export function isValidMaterialWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

// Minimum IOR value physically meaningful for a real material. Below this threshold, a
// material would allow light to travel faster than in vacuum (n < 1 is only possible for
// metamaterials). Water is ~1.33, glass ~1.5, diamond ~2.4.
const MIN_MATERIAL_IOR = 1.0;
// Maximum IOR value clamped by glTF KHR_materials_ior spec (physical materials range ≤ ~5).
// Diamond is ~2.4; higher values are exotic / computationally unstable in standard BRDF models.
const MAX_MATERIAL_IOR = 5.0;
