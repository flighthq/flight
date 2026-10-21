use crate::StandardPbrMaterialProperties;

pub fn clamp_standard_pbr_material_properties(
    out: &mut StandardPbrMaterialProperties,
) -> &mut StandardPbrMaterialProperties {
    out.metallic = out.metallic.clamp(0.0, 1.0);
    out.roughness = out.roughness.clamp(0.0, 1.0);
    out.occlusion_strength = out.occlusion_strength.clamp(0.0, 1.0);
    out.emissive_strength = out.emissive_strength.max(0.0);
    out.normal_scale = out.normal_scale.max(0.0);
    return out;
}

pub fn is_valid_material_clearcoat(value: f32) -> bool {
    return value.is_finite() && value >= 0.0 && value <= 1.0;
}

pub fn is_valid_material_ior(value: f32) -> bool {
    return value.is_finite() && value >= MIN_MATERIAL_IOR && value <= MAX_MATERIAL_IOR;
}

pub fn is_valid_material_iridescence_thickness(value: f32) -> bool {
    return value.is_finite() && value >= 0.0;
}

pub fn is_valid_material_weight(value: f32) -> bool {
    return value.is_finite() && value >= 0.0 && value <= 1.0;
}

const MIN_MATERIAL_IOR: f32 = 1.0;
const MAX_MATERIAL_IOR: f32 = 5.0;
