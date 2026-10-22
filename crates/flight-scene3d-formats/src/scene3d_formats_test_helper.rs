use flight_entity::{Ref, throw_error};
use flight_image::ImageResourceReference;
use flight_texture::Texture;
use std::sync::Arc;

pub fn get_test_texture_resource(
    resources: &[ImageResourceReference],
    texture: &Ref<Texture>,
) -> ImageResourceReference {
    for resource in resources {
        let found = match resource {
            ImageResourceReference::Embedded(value) => value
                .reference
                .read()
                .unwrap()
                .textures
                .iter()
                .any(|candidate| Arc::ptr_eq(candidate, texture)),
            ImageResourceReference::External(value) => value
                .reference
                .read()
                .unwrap()
                .textures
                .iter()
                .any(|candidate| Arc::ptr_eq(candidate, texture)),
        };
        if found {
            return resource.clone();
        }
    }
    throw_error("texture is not associated with a scene resource");
}
