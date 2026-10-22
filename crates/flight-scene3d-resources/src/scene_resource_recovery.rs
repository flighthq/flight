use std::collections::HashSet;

use flight_entity::Ref;
use flight_image::reset_failed_image_resource_reference;
use flight_scene3d::Scene3D;

use crate::get_scene3d_resource_textures::{
    get_image_resource_reference_identity, get_scene3d_resource_textures,
    get_scene3d_texture_resource_reference,
};
use crate::resolve_scene3d_resources::update_scene3d_resource_streaming;
use crate::types::*;

/// Resets every selected failed identity once, then performs a streaming update under the same
/// selection and priority policy. Returns the number of identities reset.
pub fn retry_failed_scene3d_resources(
    scene: &Ref<Scene3D>,
    resolver: &Ref<Scene3DResourceResolver>,
    options: Option<&UpdateScene3DResourceStreamingOptions>,
) -> usize {
    let mut reset: HashSet<usize> = HashSet::new();
    {
        let scene = scene.read().unwrap();
        let mut textures = Vec::new();
        get_scene3d_resource_textures(&mut textures, &scene);
        for texture in &textures {
            let Some(reference) = get_scene3d_texture_resource_reference(&scene, texture) else {
                continue;
            };
            let key = get_image_resource_reference_identity(&reference);
            if reset.contains(&key) {
                continue;
            }
            let selected = options
                .and_then(|options| options.select.as_ref())
                .is_none_or(|select| select(texture, &reference));
            if !selected {
                continue;
            }
            if reset_failed_image_resource_reference(&reference) {
                reset.insert(key);
            }
        }
    }
    update_scene3d_resource_streaming(scene, resolver, options);
    return reset.len();
}
