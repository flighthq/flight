use std::sync::Arc;

use flight_materials::{SHEEN_PBR_EXTENSION_KIND, PbrExtension};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_sheen_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_pbr_extension_textures(
        registry,
        SHEEN_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::Sheen(sheen) = extension else {
                return;
            };
            push_texture_slot(&sheen.sheen_color_map, out);
            push_texture_slot(&sheen.sheen_roughness_map, out);
        }),
    );
}
