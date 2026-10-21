use std::sync::Mutex;

use flight_color::{allocate_linear_color, unpack_color_to_linear};
use flight_entity::allocate_entity;

use crate::{
    MaterialAlphaMode, MaterialConversionExplanation, MaterialConversionGuard,
    SpecularGlossinessPbrMaterial, StandardPbrMaterial, StandardPbrMaterialProperties,
    BLEND_MODE_NORMAL, SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND,
    STANDARD_PBR_MATERIAL_KIND,
    explain_material_conversion::explain_specular_glossiness_conversion,
};

pub fn convert_specular_glossiness_to_standard_pbr(
    out: &mut StandardPbrMaterialProperties,
    source: &SpecularGlossinessPbrMaterial,
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

pub fn create_specular_glossiness_pbr_material() -> SpecularGlossinessPbrMaterial {
    let mut m: SpecularGlossinessPbrMaterial = allocate_entity();
    m.kind = SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    m.diffuse = 0xffffffff;
    m.diffuse_map = None;
    m.emissive = 0x000000ff;
    m.emissive_map = None;
    m.emissive_strength = 1.0;
    m.glossiness = 1.0;
    m.normal_map = None;
    m.normal_scale = 1.0;
    m.occlusion_map = None;
    m.occlusion_strength = 1.0;
    m.specular = 0xffffffff;
    m.specular_glossiness_map = None;
    return m;
}

pub fn create_standard_pbr_material() -> StandardPbrMaterial {
    let mut m: StandardPbrMaterial = allocate_entity();
    m.kind = STANDARD_PBR_MATERIAL_KIND.to_string();
    m.name = None;
    m.alpha_cutoff = 0.5;
    m.alpha_mode = MaterialAlphaMode::Opaque;
    m.blend_mode = BLEND_MODE_NORMAL.to_string();
    m.double_sided = false;
    assign_standard_pbr_material_properties_default(&mut m);
    return m;
}

pub fn create_standard_pbr_material_properties() -> StandardPbrMaterialProperties {
    let mut properties = StandardPbrMaterialProperties::default();
    assign_standard_pbr_material_properties_defaults(&mut properties);
    return properties;
}

fn assign_standard_pbr_material_properties_default(target: &mut StandardPbrMaterial) {
    target.alpha_map = None;
    target.base_color = 0xffffffff;
    target.base_color_map = None;
    target.emissive = 0x000000ff;
    target.emissive_map = None;
    target.emissive_strength = 1.0;
    target.metallic = 0.0;
    target.metallic_roughness_map = None;
    target.normal_map = None;
    target.normal_scale = 1.0;
    target.occlusion_map = None;
    target.occlusion_strength = 1.0;
    target.roughness = 1.0;
}

fn assign_standard_pbr_material_properties_defaults(target: &mut StandardPbrMaterialProperties) {
    target.alpha_map = None;
    target.base_color = 0xffffffff;
    target.base_color_map = None;
    target.emissive = 0x000000ff;
    target.emissive_map = None;
    target.emissive_strength = 1.0;
    target.metallic = 0.0;
    target.metallic_roughness_map = None;
    target.normal_map = None;
    target.normal_scale = 1.0;
    target.occlusion_map = None;
    target.occlusion_strength = 1.0;
    target.roughness = 1.0;
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

pub fn report_material_conversion_drop(
    explanation: &MaterialConversionExplanation,
    conversion: &str,
) {
    let guard = CONVERSION_GUARD.lock().unwrap();
    if let Some(ref g) = *guard {
        g(explanation, conversion);
    }
}

pub fn set_material_conversion_guard(guard: Option<MaterialConversionGuard>) {
    let mut current = CONVERSION_GUARD.lock().unwrap();
    *current = guard;
}

static CONVERSION_GUARD: Mutex<Option<MaterialConversionGuard>> = Mutex::new(None);
