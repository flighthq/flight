use flight_entity::allocate_entity;

use crate::{
    SHEEN_PBR_EXTENSION_KIND, SheenPbrExtension, material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_sheen_pbr_extension() -> SheenPbrExtension {
    let mut out: SheenPbrExtension = allocate_entity();
    initialize_sheen_pbr_extension(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
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
