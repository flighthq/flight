use flight_entity::allocate_entity;

use crate::{
    IRIDESCENCE_PBR_EXTENSION_KIND, IridescencePbrExtension,
    material_validation::{
        is_valid_material_ior, is_valid_material_iridescence_thickness, is_valid_material_weight,
    },
    pbr_extension::is_valid_pbr_uv_set,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_iridescence_pbr_extension() -> IridescencePbrExtension {
    let mut out: IridescencePbrExtension = allocate_entity();
    initialize_iridescence_pbr_extension(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_iridescence_pbr_extension(out: &mut IridescencePbrExtension) {
    out.iridescence = 0.0;
    out.iridescence_ior = 1.3;
    out.iridescence_map = None;
    out.iridescence_map_uv_set = 0;
    out.iridescence_thickness_map = None;
    out.iridescence_thickness_map_uv_set = 0;
    out.iridescence_thickness_max = 400.0;
    out.iridescence_thickness_min = 100.0;
    out.kind = IRIDESCENCE_PBR_EXTENSION_KIND.to_string();
}

pub fn is_valid_iridescence_pbr_extension(value: &IridescencePbrExtension) -> bool {
    return is_valid_material_weight(value.iridescence)
        && is_valid_material_ior(value.iridescence_ior)
        && is_valid_material_iridescence_thickness(value.iridescence_thickness_min)
        && is_valid_material_iridescence_thickness(value.iridescence_thickness_max)
        && value.iridescence_thickness_min <= value.iridescence_thickness_max
        && is_valid_pbr_uv_set(value.iridescence_map_uv_set)
        && is_valid_pbr_uv_set(value.iridescence_thickness_map_uv_set);
}
