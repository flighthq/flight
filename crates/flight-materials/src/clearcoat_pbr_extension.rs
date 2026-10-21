use flight_entity::allocate_entity;

use crate::{
    ClearcoatPbrExtension, CLEARCOAT_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_clearcoat_pbr_extension() -> ClearcoatPbrExtension {
    let mut out: ClearcoatPbrExtension = allocate_entity();
    initialize_clearcoat_pbr_extension(&mut out);
    return out;
}

pub fn initialize_clearcoat_pbr_extension(out: &mut ClearcoatPbrExtension) {
    out.clearcoat = 0.0;
    out.clearcoat_map = None;
    out.clearcoat_map_uv_set = 0;
    out.clearcoat_normal_map = None;
    out.clearcoat_normal_map_uv_set = 0;
    out.clearcoat_normal_scale = 1.0;
    out.clearcoat_roughness = 0.0;
    out.clearcoat_roughness_map = None;
    out.clearcoat_roughness_map_uv_set = 0;
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
