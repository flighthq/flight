use flight_entity::allocate_entity;

use crate::{
    WrappedDiffusePbrExtension, WrappedDiffusePbrExtensionOptions, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_wrapped_diffuse_pbr_extension(opts: Option<&WrappedDiffusePbrExtensionOptions>) -> WrappedDiffusePbrExtension {
    let mut out: WrappedDiffusePbrExtension = allocate_entity();
    initialize_wrapped_diffuse_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_wrapped_diffuse_pbr_extension(out: &mut WrappedDiffusePbrExtension, opts: Option<&WrappedDiffusePbrExtensionOptions>) {
    out.kind = WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string();
    out.thickness = opts.and_then(|o| o.thickness).unwrap_or(0.0);
    out.thickness_map = opts.and_then(|o| o.thickness_map.clone());
    out.thickness_map_uv_set = opts.and_then(|o| o.thickness_map_uv_set).unwrap_or(0);
    out.wrapped_diffuse_color = opts.and_then(|o| o.wrapped_diffuse_color).unwrap_or(0xffffffff);
    out.wrapped_diffuse_map = opts.and_then(|o| o.wrapped_diffuse_map.clone());
    out.wrapped_diffuse_map_uv_set = opts.and_then(|o| o.wrapped_diffuse_map_uv_set).unwrap_or(0);
    out.wrapped_diffuse_strength = opts.and_then(|o| o.wrapped_diffuse_strength).unwrap_or(0.0);
}

pub fn is_valid_wrapped_diffuse_pbr_extension(value: &WrappedDiffusePbrExtension) -> bool {
    return is_valid_material_weight(value.wrapped_diffuse_strength)
        && value.thickness.is_finite()
        && value.thickness >= 0.0
        && is_valid_pbr_uv_set(value.thickness_map_uv_set)
        && is_valid_pbr_uv_set(value.wrapped_diffuse_map_uv_set);
}
