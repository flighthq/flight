use std::sync::Arc;

use flight_materials::{ANISOTROPY_PBR_EXTENSION_KIND, PbrExtension};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_anisotropy_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_pbr_extension_textures(
        registry,
        ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::Anisotropy(anisotropy) = extension else {
                return;
            };
            push_texture_slot(&anisotropy.anisotropy_map, out);
        }),
    );
}
