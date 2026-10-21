use std::sync::{Arc, RwLock};

use flight_buffer::Blob;
use flight_entity::{Ref, Uint8Array};
use flight_image::{
    HostImageCapability, ImageCrossOrigin, ImageResource, load_image_resource_from_base64,
    load_image_resource_from_blob, load_image_resource_from_bytes, load_image_resource_from_url,
};
use flight_stream::AbortSignal;
use flight_texture::{CreateTexture2DOptions, TextureSourceRef, create_texture_2d};

use crate::texture_atlas::create_texture_atlas;
use crate::types::*;

/// An empty atlas whose page texture is a new 2D texture over `resource`.
pub fn create_texture_atlas_from_image_resource(
    resource: &Ref<ImageResource>,
) -> Ref<TextureAtlas> {
    let options = CreateTexture2DOptions {
        source: Some(resource.clone() as TextureSourceRef),
        ..CreateTexture2DOptions::default()
    };
    let texture = Arc::new(RwLock::new(create_texture_2d(Some(&options))));
    return create_texture_atlas(Some(TextureAtlasOptions {
        texture: Some(texture),
        ..TextureAtlasOptions::default()
    }));
}

/// Loads the image through the host and wraps it as an empty atlas; the image loader's rejections
/// (including aborts) propagate unchanged.
pub async fn load_texture_atlas_from_base64(
    host_image: &HostImageCapability,
    base64: &str,
    mime_type: &str,
    signal: Option<&AbortSignal>,
) -> Ref<TextureAtlas> {
    let resource = load_image_resource_from_base64(host_image, base64, mime_type, signal).await;
    return create_texture_atlas_from_image_resource(&resource);
}

/// Loads the image through the host and wraps it as an empty atlas; the image loader's rejections
/// (including aborts) propagate unchanged.
pub async fn load_texture_atlas_from_blob(
    host_image: &HostImageCapability,
    blob: &Blob,
    signal: Option<&AbortSignal>,
) -> Ref<TextureAtlas> {
    let resource = load_image_resource_from_blob(host_image, blob, signal).await;
    return create_texture_atlas_from_image_resource(&resource);
}

/// Loads the image through the host and wraps it as an empty atlas; the image loader's rejections
/// (including an undetectable MIME type and aborts) propagate unchanged.
pub async fn load_texture_atlas_from_bytes(
    host_image: &HostImageCapability,
    bytes: &Uint8Array,
    mime_type: Option<&str>,
    signal: Option<&AbortSignal>,
) -> Ref<TextureAtlas> {
    let resource = load_image_resource_from_bytes(host_image, bytes, mime_type, signal).await;
    return create_texture_atlas_from_image_resource(&resource);
}

/// Loads the image through the host and wraps it as an empty atlas; the image loader's rejections
/// (including aborts) propagate unchanged.
pub async fn load_texture_atlas_from_url(
    host_image: &HostImageCapability,
    url: &str,
    cross_origin: Option<ImageCrossOrigin>,
    signal: Option<&AbortSignal>,
) -> Ref<TextureAtlas> {
    let resource = load_image_resource_from_url(host_image, url, cross_origin, signal).await;
    return create_texture_atlas_from_image_resource(&resource);
}
