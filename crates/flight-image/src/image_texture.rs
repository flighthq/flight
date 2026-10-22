use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_texture::{CreateTexture2DOptions, Texture, clone_sampler, create_texture_2d};

use crate::types::ImageResourceReference;

// flight-lint: allow(conform-extra) D8 resource attachment moved down from texture to break the texture-image ownership cycle
pub fn create_texture_from_image_resource(
    reference: &ImageResourceReference,
    opts: Option<&CreateTexture2DOptions>,
) -> Ref<Texture> {
    let mut texture = create_texture_2d();
    if let Some(options) = opts {
        let common = &options.common;
        if let Some(value) = common.color_space {
            texture.color_space = value;
        }
        if let Some(value) = common.flip_x {
            texture.flip_x = value;
        }
        if let Some(value) = common.flip_y {
            texture.flip_y = value;
        }
        if let Some(value) = &common.sampler {
            texture.sampler = clone_sampler(value);
        }
        if let Some(value) = &common.uv_offset {
            texture.uv_offset = value.clone();
        }
        if let Some(value) = common.uv_rotation {
            texture.uv_rotation = value;
        }
        if let Some(value) = &common.uv_scale {
            texture.uv_scale = value.clone();
        }
        if let Some(value) = common.version {
            texture.version = value;
        }
        texture.source = options.source.clone();
    }
    let texture = Arc::new(RwLock::new(Texture::Texture2D(texture)));
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
