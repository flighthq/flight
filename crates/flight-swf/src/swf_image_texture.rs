use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_texture::{Texture, TextureFilter, TextureWrap, create_sampler, create_texture_2d};

pub type SwfImageTextureVariants = HashMap<String, Ref<Texture>>;

pub fn acquire_swf_image_texture(
    state: &crate::SwfTagParseState,
    character_id: u32,
    repeat: bool,
    smoothed: bool,
) -> Ref<Texture> {
    return acquire_swf_image_texture_from_map(
        &state.image_texture_order,
        &state.image_textures,
        character_id,
        repeat,
        smoothed,
    );
}

pub(crate) fn acquire_swf_image_texture_from_map(
    image_texture_order: &Ref<Vec<(u32, Ref<Texture>)>>,
    image_textures: &Ref<HashMap<u32, SwfImageTextureVariants>>,
    character_id: u32,
    repeat: bool,
    smoothed: bool,
) -> Ref<Texture> {
    let mut image_textures = image_textures.write().unwrap();
    let variants = image_textures.entry(character_id).or_default();
    let key = format!(
        "{}{}",
        if repeat { 'r' } else { 'c' },
        if smoothed { 's' } else { 'n' }
    );
    if let Some(texture) = variants.get(&key) {
        return texture.clone();
    }
    let mut sampler = create_sampler();
    sampler.mag_filter = if smoothed {
        TextureFilter::Linear
    } else {
        TextureFilter::Nearest
    };
    sampler.min_filter = if smoothed {
        TextureFilter::LinearMipmapLinear
    } else {
        TextureFilter::Nearest
    };
    sampler.mipmaps = smoothed;
    sampler.wrap_u = if repeat {
        TextureWrap::Repeat
    } else {
        TextureWrap::ClampToEdge
    };
    sampler.wrap_v = if repeat {
        TextureWrap::Repeat
    } else {
        TextureWrap::ClampToEdge
    };
    let mut texture = create_texture_2d();
    texture.sampler = sampler;
    let texture = Arc::new(RwLock::new(Texture::Texture2D(texture)));
    variants.insert(key, texture.clone());
    image_texture_order
        .write()
        .unwrap()
        .push((character_id, texture.clone()));
    return texture;
}
