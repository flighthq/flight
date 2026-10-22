use std::sync::Arc;

use flight_materials::{PbrExtension, SPECULAR_PBR_EXTENSION_KIND};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_specular_pbr_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_pbr_extension_textures(
        registry,
        SPECULAR_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::Specular(specular) = extension else {
                return;
            };
            push_texture_slot(&specular.specular_map, out);
            push_texture_slot(&specular.specular_color_map, out);
        }),
    );
}
