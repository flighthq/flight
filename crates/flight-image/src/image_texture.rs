use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_texture::{CreateTexture2DOptions, Texture, create_texture_2d};

use crate::types::ImageResourceReference;

// flight-lint: allow(conform-extra) D8 resource attachment moved down from texture to break the texture-image ownership cycle
pub fn create_texture_from_image_resource(
    reference: &ImageResourceReference,
    opts: Option<&CreateTexture2DOptions>,
) -> Ref<Texture> {
    let texture = Arc::new(RwLock::new(Texture::Texture2D(create_texture_2d(opts))));
    match reference {
        ImageResourceReference::Embedded(value) => {
            value
                .reference
                .write()
                .unwrap()
                .textures
                .push(texture.clone());
        }
        ImageResourceReference::External(value) => {
            value
                .reference
                .write()
                .unwrap()
                .textures
                .push(texture.clone());
        }
    }
    return texture;
}
