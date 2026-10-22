use std::sync::Arc;

use flight_materials::{CLEARCOAT_PBR_EXTENSION_KIND, PbrExtension};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_clearcoat_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_pbr_extension_textures(
        registry,
        CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::Clearcoat(clearcoat) = extension else {
                return;
            };
            push_texture_slot(&clearcoat.clearcoat_map, out);
            push_texture_slot(&clearcoat.clearcoat_normal_map, out);
            push_texture_slot(&clearcoat.clearcoat_roughness_map, out);
        }),
    );
}
