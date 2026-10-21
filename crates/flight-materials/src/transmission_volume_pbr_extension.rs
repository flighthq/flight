use flight_entity::allocate_entity;

use crate::{
    TransmissionVolumePbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND,
    material_validation::{is_valid_material_ior, is_valid_material_weight},
    pbr_extension::is_valid_pbr_uv_set,
};

pub fn create_transmission_volume_pbr_extension() -> TransmissionVolumePbrExtension {
    let mut out: TransmissionVolumePbrExtension = allocate_entity();
    initialize_transmission_volume_pbr_extension(&mut out);
    return out;
}

pub fn initialize_transmission_volume_pbr_extension(out: &mut TransmissionVolumePbrExtension) {
    out.attenuation_color = 0xffffffff;
    out.attenuation_distance = f32::INFINITY;
    out.ior = 1.5;
    out.kind = TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string();
    out.thickness = 0.0;
    out.thickness_map = None;
    out.thickness_map_uv_set = 0;
    out.transmission = 0.0;
    out.transmission_map = None;
    out.transmission_map_uv_set = 0;
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
