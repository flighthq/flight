use std::sync::Arc;

use flight_materials::{PbrExtension, TRANSMISSION_VOLUME_PBR_EXTENSION_KIND};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_transmission_volume_pbr_scene3d_material_textures(
    registry: &Scene3DMaterialTextureRegistry,
) {
    register_scene3d_pbr_extension_textures(
        registry,
        TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::TransmissionVolume(transmission_volume) = extension else {
                return;
            };
            push_texture_slot(&transmission_volume.transmission_map, out);
            push_texture_slot(&transmission_volume.thickness_map, out);
        }),
    );
}
