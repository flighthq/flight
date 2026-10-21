use flight_entity::allocate_entity;

use crate::{
    AnisotropyPbrExtension, AnisotropyPbrExtensionOptions, ANISOTROPY_PBR_EXTENSION_KIND,
    material_validation::is_valid_material_weight,
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_anisotropy_pbr_extension(opts: Option<&AnisotropyPbrExtensionOptions>) -> AnisotropyPbrExtension {
    let mut out: AnisotropyPbrExtension = allocate_entity();
    initialize_anisotropy_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_anisotropy_pbr_extension(out: &mut AnisotropyPbrExtension, opts: Option<&AnisotropyPbrExtensionOptions>) {
    out.anisotropy_map = opts.and_then(|o| o.anisotropy_map.clone());
    out.anisotropy_map_uv_set = opts.and_then(|o| o.anisotropy_map_uv_set).unwrap_or(0);
    out.anisotropy_rotation = opts.and_then(|o| o.anisotropy_rotation).unwrap_or(0.0);
    out.anisotropy_strength = opts.and_then(|o| o.anisotropy_strength).unwrap_or(0.0);
    out.kind = ANISOTROPY_PBR_EXTENSION_KIND.to_string();
}

pub fn is_valid_anisotropy_pbr_extension(value: &AnisotropyPbrExtension) -> bool {
    return is_valid_material_weight(value.anisotropy_strength)
        && value.anisotropy_rotation.is_finite()
        && is_valid_pbr_uv_set(value.anisotropy_map_uv_set);
}
