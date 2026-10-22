use std::collections::HashSet;
use std::sync::Arc;

use flight_entity::Ref;
use flight_image::ImageResourceReference;
use flight_scene3d::Scene3D;
use flight_texture::Texture;

pub(crate) fn get_image_resource_reference_identity(reference: &ImageResourceReference) -> usize {
    return match reference {
        ImageResourceReference::Embedded(value) => Arc::as_ptr(&value.reference) as usize,
        ImageResourceReference::External(value) => Arc::as_ptr(&value.reference) as usize,
    };
}

pub(crate) fn get_image_resource_reference_textures(
    reference: &ImageResourceReference,
) -> Vec<Ref<Texture>> {
    return match reference {
        ImageResourceReference::Embedded(value) => value.reference.read().unwrap().textures.clone(),
        ImageResourceReference::External(value) => value.reference.read().unwrap().textures.clone(),
    };
}

/// Clears `out`, then fills it with the unique textures reachable through the scene's resource
/// back-edges. A texture shared by several meshes is deduped by identity, so a resolver requests each
/// pending image at most once. Order is resource order, then per-resource texture order.
pub fn get_scene3d_resource_textures(out: &mut Vec<Ref<Texture>>, scene: &Scene3D) {
    out.clear();
    let mut seen: HashSet<usize> = HashSet::new();
    for resource in &scene.resources {
        for texture in get_image_resource_reference_textures(resource) {
            if !seen.insert(get_texture_identity(&texture)) {
                continue;
            }
            out.push(texture);
        }
    }
}

pub fn get_scene3d_texture_resource_reference(
    scene: &Scene3D,
    texture: &Ref<Texture>,
) -> Option<ImageResourceReference> {
    for resource in &scene.resources {
        let textures = get_image_resource_reference_textures(resource);
        if textures
            .iter()
            .any(|candidate| Arc::ptr_eq(candidate, texture))
        {
            return Some(resource.clone());
        }
    }
    return None;
}

pub(crate) fn get_texture_identity(texture: &Ref<Texture>) -> usize {
    return Arc::as_ptr(texture) as usize;
}

pub(crate) fn is_same_image_resource_reference(
    a: &ImageResourceReference,
    b: &ImageResourceReference,
) -> bool {
    return get_image_resource_reference_identity(a) == get_image_resource_reference_identity(b);
}
