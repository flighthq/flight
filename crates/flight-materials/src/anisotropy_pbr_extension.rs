use flight_entity::allocate_entity;

use crate::{
    AnisotropyPbrExtension, ANISOTROPY_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 3139d09f): assign fields after create
pub fn create_anisotropy_pbr_extension() -> AnisotropyPbrExtension {
    let mut out: AnisotropyPbrExtension = allocate_entity();
    initialize_anisotropy_pbr_extension(&mut out);
    return out;
}

// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 3139d09f)
pub fn initialize_anisotropy_pbr_extension(out: &mut AnisotropyPbrExtension) {
    out.anisotropy_map = None;
    out.anisotropy_map_uv_set = 0;
    out.anisotropy_rotation = 0.0;
    out.anisotropy_strength = 0.0;
    out.kind = ANISOTROPY_PBR_EXTENSION_KIND.to_string();
}

pub fn is_valid_anisotropy_pbr_extension(value: &AnisotropyPbrExtension) -> bool {
    return is_valid_material_weight(value.anisotropy_strength)
        && value.anisotropy_rotation.is_finite()
        && is_valid_pbr_uv_set(value.anisotropy_map_uv_set);
}
