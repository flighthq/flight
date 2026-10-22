use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::allocate_entity;

use crate::{
    BLEND_MODE_NORMAL, MaterialAlphaMode, MaterialConversionContext, MaterialConversionExplanation,
    MaterialConversionGuard, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND,
    SpecularGlossinessPbrMaterial, StandardPbrMaterial, StandardPbrMaterialOptions,
    StandardPbrMaterialProperties, StandardPbrMaterialPropertiesOptions,
    create_material_conversion_context,
    explain_material_conversion::explain_specular_glossiness_conversion,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_specular_glossiness_pbr_material() -> SpecularGlossinessPbrMaterial {
    let mut out: SpecularGlossinessPbrMaterial = allocate_entity();
    initialize_specular_glossiness_pbr_material(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_standard_pbr_material() -> StandardPbrMaterial {
    let mut out: StandardPbrMaterial = allocate_entity();
    initialize_standard_pbr_material(&mut out);
    return out;
}

pub fn create_standard_pbr_material_properties(
    opts: Option<&StandardPbrMaterialPropertiesOptions>,
) -> StandardPbrMaterialProperties {
    let mut properties = StandardPbrMaterialProperties::default();
    properties.alpha_map = opts.and_then(|o| o.alpha_map.clone());
    properties.base_color = opts.and_then(|o| o.base_color).unwrap_or(0xffffffff);
    properties.base_color_map = opts.and_then(|o| o.base_color_map.clone());
    properties.emissive = opts.and_then(|o| o.emissive).unwrap_or(0x000000ff);
    properties.emissive_map = opts.and_then(|o| o.emissive_map.clone());
    properties.emissive_strength = opts.and_then(|o| o.emissive_strength).unwrap_or(1.0);
    properties.metallic = opts.and_then(|o| o.metallic).unwrap_or(0.0);
    properties.metallic_roughness_map = opts.and_then(|o| o.metallic_roughness_map.clone());
    properties.normal_map = opts.and_then(|o| o.normal_map.clone());
    properties.normal_scale = opts.and_then(|o| o.normal_scale).unwrap_or(1.0);
    properties.occlusion_map = opts.and_then(|o| o.occlusion_map.clone());
    properties.occlusion_strength = opts.and_then(|o| o.occlusion_strength).unwrap_or(1.0);
    properties.roughness = opts.and_then(|o| o.roughness).unwrap_or(1.0);
    return properties;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_specular_glossiness_pbr_material(out: &mut SpecularGlossinessPbrMaterial) {
    out.kind = SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.diffuse = 0xffffffff;
    out.diffuse_map = None;
    out.emissive = 0x000000ff;
    out.emissive_map = None;
    out.emissive_strength = 1.0;
    out.glossiness = 1.0;
    out.normal_map = None;
    out.normal_scale = 1.0;
    out.occlusion_map = None;
    out.occlusion_strength = 1.0;
    out.specular = 0xffffffff;
    out.specular_glossiness_map = None;
}

// flight-lint: allow(conform-extra) D23 (I): the public initialize seam of the source create
pub fn initialize_standard_pbr_material(out: &mut StandardPbrMaterial) {
    out.kind = STANDARD_PBR_MATERIAL_KIND.to_string();
    out.name = None;
    out.alpha_cutoff = 0.5;
    out.alpha_mode = MaterialAlphaMode::Opaque;
    out.blend_mode = BLEND_MODE_NORMAL.to_string();
    out.double_sided = false;
    out.alpha_map = None;
    out.base_color = 0xffffffff;
    out.base_color_map = None;
    out.emissive = 0x000000ff;
    out.emissive_map = None;
    out.emissive_strength = 1.0;
    out.metallic = 0.0;
    out.metallic_roughness_map = None;
    out.normal_map = None;
    out.normal_scale = 1.0;
    out.occlusion_map = None;
    out.occlusion_strength = 1.0;
    out.roughness = 1.0;
}

// The source spreads the caller's partial over the preset values (`{ ...preset, ...opts }`): every
// field the caller gives wins.
pub(crate) fn apply_standard_pbr_material_options(
    out: &mut StandardPbrMaterial,
    opts: Option<&StandardPbrMaterialOptions>,
) {
    let Some(o) = opts else {
        return;
    };
    if o.name.is_some() {
        out.name = o.name.clone();
    }
    if let Some(value) = o.alpha_cutoff {
        out.alpha_cutoff = value;
    }
    if let Some(value) = o.alpha_mode {
        out.alpha_mode = value;
    }
    if let Some(value) = &o.blend_mode {
        out.blend_mode = value.clone();
    }
    if let Some(value) = o.double_sided {
        out.double_sided = value;
    }
    if o.alpha_map.is_some() {
        out.alpha_map = o.alpha_map.clone();
    }
    if let Some(value) = o.base_color {
        out.base_color = value;
    }
    if o.base_color_map.is_some() {
        out.base_color_map = o.base_color_map.clone();
    }
    if let Some(value) = o.emissive {
        out.emissive = value;
    }
    if o.emissive_map.is_some() {
        out.emissive_map = o.emissive_map.clone();
    }
    if let Some(value) = o.emissive_strength {
        out.emissive_strength = value;
    }
    if let Some(value) = o.metallic {
        out.metallic = value;
    }
    if o.metallic_roughness_map.is_some() {
        out.metallic_roughness_map = o.metallic_roughness_map.clone();
    }
    if o.normal_map.is_some() {
        out.normal_map = o.normal_map.clone();
    }
    if let Some(value) = o.normal_scale {
        out.normal_scale = value;
    }
    if o.occlusion_map.is_some() {
        out.occlusion_map = o.occlusion_map.clone();
    }
    if let Some(value) = o.occlusion_strength {
        out.occlusion_strength = value;
    }
    if let Some(value) = o.roughness {
        out.roughness = value;
    }
}

// flight-lint: allow(conform-params) D5: Rust passes caller-owned conversion context; TS uses module-scoped guard
pub fn convert_specular_glossiness_to_standard_pbr(
    out: &mut StandardPbrMaterialProperties,
    source: &SpecularGlossinessPbrMaterial,
    ctx: Option<&MaterialConversionContext>,
) {
    let diffuse = source.diffuse;
    let specular = source.specular;
    let glossiness = source.glossiness;
    let diffuse_map = source.diffuse_map.clone();
    let emissive = source.emissive;
    let emissive_map = source.emissive_map.clone();
    let emissive_strength = source.emissive_strength;
    let normal_map = source.normal_map.clone();
    let normal_scale = source.normal_scale;
    let occlusion_map = source.occlusion_map.clone();
    let occlusion_strength = source.occlusion_strength;

    let mut spec_linear = allocate_linear_color();
    unpack_color_to_linear(&mut spec_linear, specular);
    let spec_r = spec_linear.r;
    let spec_g = spec_linear.g;
    let spec_b = spec_linear.b;
    let spec_luma = 0.2126 * spec_r + 0.7152 * spec_g + 0.0722 * spec_b;

    let dielectric_f0: f32 = 0.04;
    let metallic = ((spec_luma - dielectric_f0) / (1.0 - dielectric_f0)).clamp(0.0, 1.0);

    let mut diff_linear = allocate_linear_color();
    unpack_color_to_linear(&mut diff_linear, diffuse);
    let diff_r = diff_linear.r;
    let diff_g = diff_linear.g;
    let diff_b = diff_linear.b;
    let diff_a = diff_linear.a;

    let base_r = diff_r * (1.0 - spec_luma * (1.0 - metallic));
    let base_g = diff_g * (1.0 - spec_luma * (1.0 - metallic));
    let base_b = diff_b * (1.0 - spec_luma * (1.0 - metallic));
    let base_color = pack_linear(base_r, base_g, base_b, diff_a);

    out.alpha_map = None;
    out.base_color = base_color;
    out.base_color_map = diffuse_map;
    out.emissive = emissive;
    out.emissive_map = emissive_map;
    out.emissive_strength = emissive_strength;
    out.metallic = metallic;
    if source.specular_glossiness_map.is_some() {
        report_material_conversion_drop(
            ctx,
            &explain_specular_glossiness_conversion(source),
            "convert_specular_glossiness_to_standard_pbr",
        );
    }
    out.metallic_roughness_map = None;
    out.normal_map = normal_map;
    out.normal_scale = normal_scale;
    out.occlusion_map = occlusion_map;
    out.occlusion_strength = occlusion_strength;
    out.roughness = 1.0 - glossiness;
}

fn linear_channel_to_srgb8(value: f32) -> u32 {
    let srgb = if value <= 0.0031308 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    };
    return (srgb.clamp(0.0, 1.0) * 255.0).round() as u32;
}

fn pack_linear(r: f32, g: f32, b: f32, a: f32) -> u32 {
    return (linear_channel_to_srgb8(r) << 24)
        | (linear_channel_to_srgb8(g) << 16)
        | (linear_channel_to_srgb8(b) << 8)
        | ((a * 255.0).round() as u32);
}

// flight-lint: allow(conform-params) D5: Rust passes caller-owned context; TS reads module-scoped guard
pub fn report_material_conversion_drop(
    ctx: Option<&MaterialConversionContext>,
    explanation: &MaterialConversionExplanation,
    conversion: &str,
) {
    if let Some(c) = ctx {
        (c.guard)(explanation, conversion);
    }
}

// flight-lint: allow(conform-params) D5: Rust returns caller-owned context; TS sets module-scoped state and returns void
pub fn set_material_conversion_guard(
    guard: Option<MaterialConversionGuard>,
) -> Option<MaterialConversionContext> {
    return guard.map(create_material_conversion_context);
}
