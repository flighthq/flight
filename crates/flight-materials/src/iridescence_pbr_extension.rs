use flight_entity::allocate_entity;

use crate::{
    IridescencePbrExtension, IridescencePbrExtensionOptions, IRIDESCENCE_PBR_EXTENSION_KIND,
    material_validation::{is_valid_material_ior, is_valid_material_iridescence_thickness, is_valid_material_weight},
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_iridescence_pbr_extension(opts: Option<&IridescencePbrExtensionOptions>) -> IridescencePbrExtension {
    let mut out: IridescencePbrExtension = allocate_entity();
    initialize_iridescence_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_iridescence_pbr_extension(out: &mut IridescencePbrExtension, opts: Option<&IridescencePbrExtensionOptions>) {
    out.iridescence = opts.and_then(|o| o.iridescence).unwrap_or(0.0);
    out.iridescence_ior = opts.and_then(|o| o.iridescence_ior).unwrap_or(1.3);
    out.iridescence_map = opts.and_then(|o| o.iridescence_map.clone());
    out.iridescence_map_uv_set = opts.and_then(|o| o.iridescence_map_uv_set).unwrap_or(0);
    out.iridescence_thickness_map = opts.and_then(|o| o.iridescence_thickness_map.clone());
    out.iridescence_thickness_map_uv_set = opts.and_then(|o| o.iridescence_thickness_map_uv_set).unwrap_or(0);
    out.iridescence_thickness_max = opts.and_then(|o| o.iridescence_thickness_max).unwrap_or(400.0);
    out.iridescence_thickness_min = opts.and_then(|o| o.iridescence_thickness_min).unwrap_or(100.0);
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
