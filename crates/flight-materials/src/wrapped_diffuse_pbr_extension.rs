use flight_entity::allocate_entity;

use crate::{
    WrappedDiffusePbrExtension, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_wrapped_diffuse_pbr_extension() -> WrappedDiffusePbrExtension {
    let mut out: WrappedDiffusePbrExtension = allocate_entity();
    initialize_wrapped_diffuse_pbr_extension(&mut out);
    return out;
}

pub fn initialize_wrapped_diffuse_pbr_extension(out: &mut WrappedDiffusePbrExtension) {
    out.kind = WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string();
    out.thickness = 0.0;
    out.thickness_map = None;
    out.thickness_map_uv_set = 0;
    out.wrapped_diffuse_color = 0xffffffff;
    out.wrapped_diffuse_map = None;
    out.wrapped_diffuse_map_uv_set = 0;
    out.wrapped_diffuse_strength = 0.0;
}

pub fn is_valid_wrapped_diffuse_pbr_extension(value: &WrappedDiffusePbrExtension) -> bool {
    return is_valid_material_weight(value.wrapped_diffuse_strength)
        && value.thickness.is_finite()
        && value.thickness >= 0.0
        && is_valid_pbr_uv_set(value.thickness_map_uv_set)
        && is_valid_pbr_uv_set(value.wrapped_diffuse_map_uv_set);
}
