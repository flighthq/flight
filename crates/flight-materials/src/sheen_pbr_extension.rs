use flight_entity::allocate_entity;

use crate::{
    SheenPbrExtension, SHEEN_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_sheen_pbr_extension() -> SheenPbrExtension {
    let mut out: SheenPbrExtension = allocate_entity();
    initialize_sheen_pbr_extension(&mut out);
    return out;
}

pub fn initialize_sheen_pbr_extension(out: &mut SheenPbrExtension) {
    out.kind = SHEEN_PBR_EXTENSION_KIND.to_string();
    out.sheen_color = 0x000000ff;
    out.sheen_color_map = None;
    out.sheen_color_map_uv_set = 0;
    out.sheen_roughness = 0.0;
    out.sheen_roughness_map = None;
    out.sheen_roughness_map_uv_set = 0;
}

pub fn is_valid_sheen_pbr_extension(value: &SheenPbrExtension) -> bool {
    return is_valid_material_weight(value.sheen_roughness)
        && is_valid_pbr_uv_set(value.sheen_color_map_uv_set)
        && is_valid_pbr_uv_set(value.sheen_roughness_map_uv_set);
}
