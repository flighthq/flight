use flight_entity::allocate_entity;

use crate::{
    TransmissionVolumePbrExtension, TransmissionVolumePbrExtensionOptions, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
    material_validation::{is_valid_material_ior, is_valid_material_weight},
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_transmission_volume_pbr_extension(opts: Option<&TransmissionVolumePbrExtensionOptions>) -> TransmissionVolumePbrExtension {
    let mut out: TransmissionVolumePbrExtension = allocate_entity();
    initialize_transmission_volume_pbr_extension(&mut out, opts);
    return out;
}

pub fn initialize_transmission_volume_pbr_extension(out: &mut TransmissionVolumePbrExtension, opts: Option<&TransmissionVolumePbrExtensionOptions>) {
    out.attenuation_color = opts.and_then(|o| o.attenuation_color).unwrap_or(0xffffffff);
    out.attenuation_distance = opts.and_then(|o| o.attenuation_distance).unwrap_or(f32::INFINITY);
    out.ior = opts.and_then(|o| o.ior).unwrap_or(1.5);
    out.kind = TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string();
    out.thickness = opts.and_then(|o| o.thickness).unwrap_or(0.0);
    out.thickness_map = opts.and_then(|o| o.thickness_map.clone());
    out.thickness_map_uv_set = opts.and_then(|o| o.thickness_map_uv_set).unwrap_or(0);
    out.transmission = opts.and_then(|o| o.transmission).unwrap_or(0.0);
    out.transmission_map = opts.and_then(|o| o.transmission_map.clone());
    out.transmission_map_uv_set = opts.and_then(|o| o.transmission_map_uv_set).unwrap_or(0);
}

pub fn is_valid_transmission_volume_pbr_extension(value: &TransmissionVolumePbrExtension) -> bool {
    let valid_attenuation_distance = value.attenuation_distance == f32::INFINITY
        || (value.attenuation_distance.is_finite() && value.attenuation_distance > 0.0);
    return is_valid_material_weight(value.transmission)
        && is_valid_material_ior(value.ior)
        && value.thickness.is_finite()
        && value.thickness >= 0.0
        && valid_attenuation_distance
        && is_valid_pbr_uv_set(value.thickness_map_uv_set)
        && is_valid_pbr_uv_set(value.transmission_map_uv_set);
}
