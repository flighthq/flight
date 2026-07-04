//! Free functions for validating PBR material scalar parameters.

use flighthq_types::StandardPbrMaterialProperties;

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Clamps all metallic-roughness scalar fields of a
/// [`StandardPbrMaterialProperties`] block to their physically-valid ranges
/// in place. Writes directly to `out`:
///
/// - `metallic` → `[0, 1]`
/// - `roughness` → `[0, 1]`
/// - `occlusion_strength` → `[0, 1]`
/// - `emissive_strength` → `[0, ∞)` (clamps below 0 only; no upper bound for HDR emissive)
/// - `normal_scale` → `[0, ∞)` (clamps below 0 only)
///
/// Map references and the `base_color`/`emissive` packed-int colors are not
/// modified — those are validated by the caller (map handles come from the
/// resource system; packed colors use the full `0xRRGGBBAA` range). Returns
/// `out` for chaining.
pub fn clamp_standard_pbr_material_properties(
    out: &mut StandardPbrMaterialProperties,
) -> &mut StandardPbrMaterialProperties {
    out.metallic = out.metallic.clamp(0.0, 1.0);
    out.roughness = out.roughness.clamp(0.0, 1.0);
    out.occlusion_strength = out.occlusion_strength.clamp(0.0, 1.0);
    out.emissive_strength = out.emissive_strength.max(0.0);
    out.normal_scale = out.normal_scale.max(0.0);
    out
}

/// Returns `true` when `value` is in the clearcoat range `[0, 1]`. glTF
/// `KHR_materials_clearcoat` defines `clearcoatFactor` as a linear weight in
/// `[0, 1]`; values outside this range are invalid. Returns `false` for
/// `NaN`, infinite, and out-of-range values. Does not panic.
pub fn is_valid_material_clearcoat(value: f32) -> bool {
    value.is_finite() && value >= 0.0 && value <= 1.0
}

/// Returns `true` when `value` is a physically-valid IOR (index of
/// refraction) — i.e. a finite number in `[1.0, 5.0]`. Values outside this
/// range are not meaningful for standard dielectric BRDF models (the glTF
/// `KHR_materials_transmission` / `KHR_materials_ior` specs both gate on
/// IOR ≥ 1). Returns `false` for `NaN`, infinite, and out-of-range values.
/// Does not panic.
pub fn is_valid_material_ior(value: f32) -> bool {
    value.is_finite() && value >= MIN_MATERIAL_IOR && value <= MAX_MATERIAL_IOR
}

/// Returns `true` when `value` is a valid iridescence-layer thickness in
/// nanometers. The glTF `KHR_materials_iridescence` spec requires
/// thickness ≥ 0 nm. Returns `false` for negative, `NaN`, and infinite
/// values. Does not panic.
pub fn is_valid_material_iridescence_thickness(value: f32) -> bool {
    value.is_finite() && value >= 0.0
}

/// Returns `true` when `value` is a valid normalized weight in `[0, 1]` —
/// used for transmission, sheen strength, anisotropy strength, and other
/// parameters that represent a fractional blend or strength factor. Returns
/// `false` for `NaN`, infinite, and out-of-range values. Does not panic.
pub fn is_valid_material_weight(value: f32) -> bool {
    value.is_finite() && value >= 0.0 && value <= 1.0
}

/// Minimum IOR value physically meaningful for a real material. Below this
/// threshold, a material would allow light to travel faster than in vacuum
/// (n < 1 is only possible for metamaterials). Water is ~1.33, glass ~1.5,
/// diamond ~2.4.
pub const MIN_MATERIAL_IOR: f32 = 1.0;
/// Maximum IOR value clamped by the glTF `KHR_materials_ior` spec (physical
/// materials range ≤ ~5). Diamond is ~2.4; higher values are exotic /
/// computationally unstable in standard BRDF models.
pub const MAX_MATERIAL_IOR: f32 = 5.0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // clamp_standard_pbr_material_properties
    #[test]
    fn clamp_standard_pbr_material_properties_clamps_metallic_above_one() {
        let mut props = StandardPbrMaterialProperties {
            metallic: 1.5,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.metallic, 1.0);
    }

    #[test]
    fn clamp_standard_pbr_material_properties_clamps_roughness_below_zero() {
        let mut props = StandardPbrMaterialProperties {
            roughness: -0.5,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.roughness, 0.0);
    }

    #[test]
    fn clamp_standard_pbr_material_properties_clamps_occlusion_strength() {
        let mut props = StandardPbrMaterialProperties {
            occlusion_strength: 2.0,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.occlusion_strength, 1.0);
    }

    #[test]
    fn clamp_standard_pbr_material_properties_clamps_negative_emissive_strength() {
        let mut props = StandardPbrMaterialProperties {
            emissive_strength: -1.0,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.emissive_strength, 0.0);
    }

    #[test]
    fn clamp_standard_pbr_material_properties_allows_high_emissive_strength() {
        let mut props = StandardPbrMaterialProperties {
            emissive_strength: 10.0,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.emissive_strength, 10.0);
    }

    #[test]
    fn clamp_standard_pbr_material_properties_clamps_negative_normal_scale() {
        let mut props = StandardPbrMaterialProperties {
            normal_scale: -2.0,
            ..StandardPbrMaterialProperties::default()
        };
        clamp_standard_pbr_material_properties(&mut props);
        assert_eq!(props.normal_scale, 0.0);
    }

    // is_valid_material_clearcoat
    #[test]
    fn is_valid_material_clearcoat_accepts_range() {
        assert!(is_valid_material_clearcoat(0.0));
        assert!(is_valid_material_clearcoat(0.5));
        assert!(is_valid_material_clearcoat(1.0));
    }

    #[test]
    fn is_valid_material_clearcoat_rejects_out_of_range() {
        assert!(!is_valid_material_clearcoat(-0.1));
        assert!(!is_valid_material_clearcoat(1.1));
        assert!(!is_valid_material_clearcoat(f32::NAN));
        assert!(!is_valid_material_clearcoat(f32::INFINITY));
    }

    // is_valid_material_ior
    #[test]
    fn is_valid_material_ior_accepts_range() {
        assert!(is_valid_material_ior(1.0));
        assert!(is_valid_material_ior(1.5));
        assert!(is_valid_material_ior(5.0));
    }

    #[test]
    fn is_valid_material_ior_rejects_out_of_range() {
        assert!(!is_valid_material_ior(0.9));
        assert!(!is_valid_material_ior(5.1));
        assert!(!is_valid_material_ior(f32::NAN));
        assert!(!is_valid_material_ior(f32::INFINITY));
    }

    // is_valid_material_iridescence_thickness
    #[test]
    fn is_valid_material_iridescence_thickness_accepts_nonnegative() {
        assert!(is_valid_material_iridescence_thickness(0.0));
        assert!(is_valid_material_iridescence_thickness(500.0));
        assert!(is_valid_material_iridescence_thickness(5000.0));
    }

    #[test]
    fn is_valid_material_iridescence_thickness_rejects_invalid() {
        assert!(!is_valid_material_iridescence_thickness(-1.0));
        assert!(!is_valid_material_iridescence_thickness(f32::NAN));
        assert!(!is_valid_material_iridescence_thickness(f32::INFINITY));
    }

    // is_valid_material_weight
    #[test]
    fn is_valid_material_weight_accepts_range() {
        assert!(is_valid_material_weight(0.0));
        assert!(is_valid_material_weight(0.5));
        assert!(is_valid_material_weight(1.0));
    }

    #[test]
    fn is_valid_material_weight_rejects_out_of_range() {
        assert!(!is_valid_material_weight(-0.1));
        assert!(!is_valid_material_weight(1.1));
        assert!(!is_valid_material_weight(f32::NAN));
        assert!(!is_valid_material_weight(f32::INFINITY));
    }
}
