use flight_entity::allocate_entity;

use crate::{
    SPECULAR_PBR_EXTENSION_KIND, SpecularPbrExtension,
    material_validation::is_valid_material_weight, pbr_extension::is_valid_pbr_uv_set,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_specular_pbr_extension() -> SpecularPbrExtension {
    let mut out: SpecularPbrExtension = allocate_entity();
    initialize_specular_pbr_extension(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_specular_pbr_extension(out: &mut SpecularPbrExtension) {
    out.kind = SPECULAR_PBR_EXTENSION_KIND.to_string();
    out.specular = 1.0;
    out.specular_color = 0xffffffff;
    out.specular_color_map = None;
    out.specular_color_map_uv_set = 0;
    out.specular_map = None;
    out.specular_map_uv_set = 0;
}

pub fn is_valid_specular_pbr_extension(value: &SpecularPbrExtension) -> bool {
    return is_valid_material_weight(value.specular)
        && is_valid_pbr_uv_set(value.specular_color_map_uv_set)
        && is_valid_pbr_uv_set(value.specular_map_uv_set);
}
