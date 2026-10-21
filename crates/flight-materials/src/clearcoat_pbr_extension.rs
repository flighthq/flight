use flight_entity::allocate_entity;

use crate::{
    ClearcoatPbrExtension, ClearcoatPbrExtensionOptions, CLEARCOAT_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_clearcoat_pbr_extension(opts: Option<&ClearcoatPbrExtensionOptions>) -> ClearcoatPbrExtension {
    let mut out: ClearcoatPbrExtension = allocate_entity();
    initialize_clearcoat_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_clearcoat_pbr_extension(out: &mut ClearcoatPbrExtension, opts: Option<&ClearcoatPbrExtensionOptions>) {
    out.clearcoat = opts.and_then(|o| o.clearcoat).unwrap_or(0.0);
    out.clearcoat_map = opts.and_then(|o| o.clearcoat_map.clone());
    out.clearcoat_map_uv_set = opts.and_then(|o| o.clearcoat_map_uv_set).unwrap_or(0);
    out.clearcoat_normal_map = opts.and_then(|o| o.clearcoat_normal_map.clone());
    out.clearcoat_normal_map_uv_set = opts.and_then(|o| o.clearcoat_normal_map_uv_set).unwrap_or(0);
    out.clearcoat_normal_scale = opts.and_then(|o| o.clearcoat_normal_scale).unwrap_or(1.0);
    out.clearcoat_roughness = opts.and_then(|o| o.clearcoat_roughness).unwrap_or(0.0);
    out.clearcoat_roughness_map = opts.and_then(|o| o.clearcoat_roughness_map.clone());
    out.clearcoat_roughness_map_uv_set = opts.and_then(|o| o.clearcoat_roughness_map_uv_set).unwrap_or(0);
    out.kind = CLEARCOAT_PBR_EXTENSION_KIND.to_string();
}

pub fn is_valid_clearcoat_pbr_extension(value: &ClearcoatPbrExtension) -> bool {
    return is_valid_material_weight(value.clearcoat)
        && is_valid_material_weight(value.clearcoat_roughness)
        && value.clearcoat_normal_scale.is_finite()
        && value.clearcoat_normal_scale >= 0.0
        && is_valid_pbr_uv_set(value.clearcoat_map_uv_set)
        && is_valid_pbr_uv_set(value.clearcoat_normal_map_uv_set)
        && is_valid_pbr_uv_set(value.clearcoat_roughness_map_uv_set);
}
