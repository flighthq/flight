use flight_entity::allocate_entity;

use crate::{
    SpecularPbrExtension, SpecularPbrExtensionOptions, SPECULAR_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_specular_pbr_extension(opts: Option<&SpecularPbrExtensionOptions>) -> SpecularPbrExtension {
    let mut out: SpecularPbrExtension = allocate_entity();
    initialize_specular_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_specular_pbr_extension(out: &mut SpecularPbrExtension, opts: Option<&SpecularPbrExtensionOptions>) {
    out.kind = SPECULAR_PBR_EXTENSION_KIND.to_string();
    out.specular = opts.and_then(|o| o.specular).unwrap_or(1.0);
    out.specular_color = opts.and_then(|o| o.specular_color).unwrap_or(0xffffffff);
    out.specular_color_map = opts.and_then(|o| o.specular_color_map.clone());
    out.specular_color_map_uv_set = opts.and_then(|o| o.specular_color_map_uv_set).unwrap_or(0);
    out.specular_map = opts.and_then(|o| o.specular_map.clone());
    out.specular_map_uv_set = opts.and_then(|o| o.specular_map_uv_set).unwrap_or(0);
}

pub fn is_valid_specular_pbr_extension(value: &SpecularPbrExtension) -> bool {
    return is_valid_material_weight(value.specular)
        && is_valid_pbr_uv_set(value.specular_color_map_uv_set)
        && is_valid_pbr_uv_set(value.specular_map_uv_set);
}
