use std::sync::Arc;

use flight_materials::{PbrExtension, WRAPPED_DIFFUSE_PBR_EXTENSION_KIND};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_pbr_extension_textures,
};
use crate::types::*;

pub fn register_wrapped_diffuse_pbr_scene3d_material_textures(
    registry: &Scene3DMaterialTextureRegistry,
) {
    register_scene3d_pbr_extension_textures(
        registry,
        WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string(),
        Arc::new(|extension, out| {
            let PbrExtension::WrappedDiffuse(wrapped_diffuse) = extension else {
                return;
            };
            push_texture_slot(&wrapped_diffuse.wrapped_diffuse_map, out);
            push_texture_slot(&wrapped_diffuse.thickness_map, out);
        }),
    );
}
