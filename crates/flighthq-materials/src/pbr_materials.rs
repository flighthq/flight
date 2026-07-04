//! Constructors and kind ids for the core glTF metallic-roughness PBR
//! material ([`StandardPbrMaterial`]) and the legacy specular-glossiness
//! workflow ([`SpecularGlossinessPbrMaterial`]).

use flighthq_types::{
    KindId, SpecularGlossinessPbrMaterial, StandardPbrMaterial, StandardPbrMaterialProperties,
    Texture, standard_pbr_material_kind,
};

use crate::color::{
    LinearColor, create_linear_color, pack_linear_to_color, unpack_color_to_linear,
};
use crate::surface_material::create_surface_material;

// ---------------------------------------------------------------------------
// Kind constants
// ---------------------------------------------------------------------------

/// Stable `KindId` for [`SpecularGlossinessPbrMaterial`].
pub fn specular_glossiness_pbr_material_kind() -> KindId {
    KindId::of::<SpecularGlossinessPbrMaterial>()
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`create_specular_glossiness_pbr_material`]. `diffuse`
/// defaults to white, `specular` to white, `glossiness` to 1, `emissive` to
/// opaque black, `emissive_strength` to 1, `normal_scale`/
/// `occlusion_strength` to 1, all maps to `None`.
#[derive(Clone, Debug, Default)]
pub struct SpecularGlossinessPbrMaterialOptions {
    pub diffuse: Option<u32>,
    pub diffuse_map: Option<Texture>,
    pub emissive: Option<u32>,
    pub emissive_map: Option<Texture>,
    pub emissive_strength: Option<f32>,
    pub glossiness: Option<f32>,
    pub normal_map: Option<Texture>,
    pub normal_scale: Option<f32>,
    pub occlusion_map: Option<Texture>,
    pub occlusion_strength: Option<f32>,
    pub specular: Option<u32>,
    pub specular_glossiness_map: Option<Texture>,
}

/// Options for [`create_standard_pbr_material`]. See
/// [`StandardPbrMaterialProperties::default`] for the defaults: white
/// `base_color`, fully dielectric (`metallic` 0) and fully rough
/// (`roughness` 1), opaque-black `emissive` at unit strength, unit
/// `normal_scale`/`occlusion_strength`, all maps `None`.
pub type StandardPbrMaterialOptions = StandardPbrMaterialProperties;

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Converts a legacy specular-glossiness material to a metallic-roughness
/// property block. Writes `out` with the computed base-color, metallic, and
/// roughness values. The conversion is the canonical
/// `KHR_materials_pbrSpecularGlossiness` → metallic-roughness approximation:
///
/// - `roughness = 1 - glossiness`
/// - `metallic = max(specularLinear)` above the dielectric threshold (~ 0.04 F0)
/// - `baseColor` = blend of diffuse and inferred albedo based on the metallic estimate
///
/// Lossiness: the conversion is an approximation — metal/dielectric
/// separation derived from the specular luma cannot fully recover the
/// original material on every surface.
///
/// Map assignments: `diffuse_map` → `base_color_map`;
/// `specular_glossiness_map` → `metallic_roughness_map` (packing semantics
/// differ — the renderer must remap channels). `normal_map`, `occlusion_map`,
/// `emissive_map`, `normal_scale`, `occlusion_strength`, and
/// `emissive_strength` are forwarded unchanged.
pub fn convert_specular_glossiness_to_standard_pbr(
    out: &mut StandardPbrMaterialProperties,
    source: &SpecularGlossinessPbrMaterial,
) {
    // Read all input values into locals before writing (alias-safe).
    let diffuse = source.diffuse;
    let specular = source.specular;
    let glossiness = source.glossiness;
    let diffuse_map = source.diffuse_map.clone();
    let specular_glossiness_map = source.specular_glossiness_map.clone();
    let emissive = source.emissive;
    let emissive_map = source.emissive_map.clone();
    let emissive_strength = source.emissive_strength;
    let normal_map = source.normal_map.clone();
    let normal_scale = source.normal_scale;
    let occlusion_map = source.occlusion_map.clone();
    let occlusion_strength = source.occlusion_strength;

    // Unpack the specular color to linear to compute F0 luminance for the
    // metallic estimate.
    let mut spec_linear: LinearColor = create_linear_color();
    unpack_color_to_linear(&mut spec_linear, specular);
    let spec_r = spec_linear[0];
    let spec_g = spec_linear[1];
    let spec_b = spec_linear[2];
    // Perceived luminance of the specular F0 (Rec. 709 weights).
    let spec_luma = 0.2126 * spec_r + 0.7152 * spec_g + 0.0722 * spec_b;
    // The dielectric F0 threshold: ~0.04 (4% reflectance). A specular luma
    // above this is characteristic of metallic response; map linearly to
    // [0, 1].
    const DIELECTRIC_F0: f64 = 0.04;
    let metallic = ((spec_luma - DIELECTRIC_F0) / (1.0 - DIELECTRIC_F0)).clamp(0.0, 1.0);

    // Base color: for metals the diffuse is the albedo; for dielectrics it
    // is the diffuse. Blend: baseColor = lerp(diffuse * (1 - specLuma), diffuse, metallic).
    let mut diff_linear: LinearColor = create_linear_color();
    unpack_color_to_linear(&mut diff_linear, diffuse);
    let diff_r = diff_linear[0];
    let diff_g = diff_linear[1];
    let diff_b = diff_linear[2];
    let diff_a = diff_linear[3];
    let base_r = diff_r * (1.0 - spec_luma * (1.0 - metallic));
    let base_g = diff_g * (1.0 - spec_luma * (1.0 - metallic));
    let base_b = diff_b * (1.0 - spec_luma * (1.0 - metallic));
    let base_color = pack_linear_to_color(&[base_r, base_g, base_b, diff_a]);

    out.base_color = base_color;
    out.base_color_map = diffuse_map;
    out.emissive = emissive;
    out.emissive_map = emissive_map;
    out.emissive_strength = emissive_strength;
    out.metallic = metallic as f32;
    out.metallic_roughness_map = specular_glossiness_map;
    out.normal_map = normal_map;
    out.normal_scale = normal_scale;
    out.occlusion_map = occlusion_map;
    out.occlusion_strength = occlusion_strength;
    out.roughness = 1.0 - glossiness;
}

/// Legacy specular-glossiness PBR material (converted to metallic-roughness
/// at bind). `diffuse` defaults to white, `specular` to white, `glossiness`
/// to 1, `emissive` to opaque black, `emissive_strength` to 1,
/// `normal_scale`/`occlusion_strength` to 1, all maps to `None`.
pub fn create_specular_glossiness_pbr_material(
    options: &SpecularGlossinessPbrMaterialOptions,
) -> SpecularGlossinessPbrMaterial {
    let trailer = create_surface_material(specular_glossiness_pbr_material_kind());
    SpecularGlossinessPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        diffuse: options.diffuse.unwrap_or(0xffffffff),
        diffuse_map: options.diffuse_map.clone(),
        emissive: options.emissive.unwrap_or(0x000000ff),
        emissive_map: options.emissive_map.clone(),
        emissive_strength: options.emissive_strength.unwrap_or(1.0),
        glossiness: options.glossiness.unwrap_or(1.0),
        normal_map: options.normal_map.clone(),
        normal_scale: options.normal_scale.unwrap_or(1.0),
        occlusion_map: options.occlusion_map.clone(),
        occlusion_strength: options.occlusion_strength.unwrap_or(1.0),
        specular: options.specular.unwrap_or(0xffffffff),
        specular_glossiness_map: options.specular_glossiness_map.clone(),
    }
}

/// Core glTF metallic-roughness PBR material. Defaults: white `base_color`,
/// fully dielectric (`metallic` 0) and fully rough (`roughness` 1),
/// opaque-black `emissive` at unit strength, unit `normal_scale`/
/// `occlusion_strength`, all maps `None`.
pub fn create_standard_pbr_material(options: &StandardPbrMaterialOptions) -> StandardPbrMaterial {
    let trailer = create_surface_material(standard_pbr_material_kind());
    StandardPbrMaterial {
        kind: trailer.kind,
        alpha_cutoff: trailer.alpha_cutoff,
        alpha_mode: trailer.alpha_mode,
        alpha_type: trailer.alpha_type,
        blend_mode: trailer.blend_mode,
        double_sided: trailer.double_sided,
        standard: options.clone(),
    }
}

/// Builds the reusable [`StandardPbrMaterialProperties`] block that
/// PBR-extension materials compose into their `standard` field. Same
/// defaults as [`create_standard_pbr_material`], without a kind or the
/// surface trailer.
pub fn create_standard_pbr_material_properties(
    options: &StandardPbrMaterialOptions,
) -> StandardPbrMaterialProperties {
    options.clone()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use flighthq_types::Material;

    use super::*;

    // convert_specular_glossiness_to_standard_pbr
    #[test]
    fn convert_specular_glossiness_to_standard_pbr_roughness_is_one_minus_glossiness() {
        let source =
            create_specular_glossiness_pbr_material(&SpecularGlossinessPbrMaterialOptions {
                glossiness: Some(0.8),
                ..Default::default()
            });
        let mut out = StandardPbrMaterialProperties::default();
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert!((out.roughness - 0.2).abs() < 0.01);
    }

    #[test]
    fn convert_specular_glossiness_to_standard_pbr_forwards_maps_and_scalars() {
        let source =
            create_specular_glossiness_pbr_material(&SpecularGlossinessPbrMaterialOptions {
                emissive: Some(0x112233ff),
                emissive_strength: Some(2.0),
                normal_scale: Some(0.5),
                occlusion_strength: Some(0.75),
                ..Default::default()
            });
        let mut out = StandardPbrMaterialProperties::default();
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert_eq!(out.emissive, 0x112233ff);
        assert_eq!(out.emissive_strength, 2.0);
        assert_eq!(out.normal_scale, 0.5);
        assert_eq!(out.occlusion_strength, 0.75);
    }

    #[test]
    fn convert_specular_glossiness_to_standard_pbr_white_specular_is_metallic() {
        let source =
            create_specular_glossiness_pbr_material(&SpecularGlossinessPbrMaterialOptions {
                specular: Some(0xffffffff),
                ..Default::default()
            });
        let mut out = StandardPbrMaterialProperties::default();
        convert_specular_glossiness_to_standard_pbr(&mut out, &source);
        assert_eq!(out.metallic, 1.0);
    }

    // create_specular_glossiness_pbr_material
    #[test]
    fn create_specular_glossiness_pbr_material_applies_defaults() {
        let m = create_specular_glossiness_pbr_material(
            &SpecularGlossinessPbrMaterialOptions::default(),
        );
        assert_eq!(m.kind(), specular_glossiness_pbr_material_kind());
        assert_eq!(m.diffuse, 0xffffffff);
        assert_eq!(m.glossiness, 1.0);
        assert_eq!(m.emissive, 0x000000ff);
    }

    // create_standard_pbr_material
    #[test]
    fn create_standard_pbr_material_applies_defaults() {
        let m = create_standard_pbr_material(&StandardPbrMaterialOptions::default());
        assert_eq!(m.kind(), standard_pbr_material_kind());
        assert_eq!(m.standard.metallic, 0.0);
        assert_eq!(m.standard.roughness, 1.0);
        assert_eq!(m.standard.base_color, 0xffffffff);
    }

    #[test]
    fn create_standard_pbr_material_carries_provided_values() {
        let m = create_standard_pbr_material(&StandardPbrMaterialOptions {
            base_color: 0x123456ff,
            metallic: 1.0,
            ..Default::default()
        });
        assert_eq!(m.standard.base_color, 0x123456ff);
        assert_eq!(m.standard.metallic, 1.0);
    }

    // create_standard_pbr_material_properties
    #[test]
    fn create_standard_pbr_material_properties_applies_defaults() {
        let p = create_standard_pbr_material_properties(&StandardPbrMaterialOptions::default());
        assert_eq!(p.base_color, 0xffffffff);
        assert_eq!(p.metallic, 0.0);
        assert_eq!(p.roughness, 1.0);
    }

    // specular_glossiness_pbr_material_kind
    #[test]
    fn specular_glossiness_pbr_material_kind_is_stable() {
        assert_eq!(
            specular_glossiness_pbr_material_kind(),
            specular_glossiness_pbr_material_kind()
        );
    }
}
