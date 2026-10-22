use std::sync::Arc;

use flight_shading::{SHADED_MATERIAL_KIND, ShadedMaterial};

use crate::scene_material_texture_registry::{
    push_texture_slot, register_scene3d_material_textures,
};
use crate::types::*;

/// Lists the ShadedMaterial base maps. Registered separately from the surface-material listers so an
/// app that never uses the shaded base pays nothing for it. Modifier textures need a per-modifier
/// lister registry of their own; no importer emits modifiers yet.
pub fn register_shaded_scene3d_material_textures(registry: &Scene3DMaterialTextureRegistry) {
    register_scene3d_material_textures(
        registry,
        SHADED_MATERIAL_KIND.to_string(),
        Arc::new(|material, out| {
            let Some(shaded) = material.as_any().downcast_ref::<ShadedMaterial>() else {
                return;
            };
            push_texture_slot(&shaded.diffuse_map, out);
            push_texture_slot(&shaded.normal_map, out);
            push_texture_slot(&shaded.specular_map, out);
        }),
    );
}
