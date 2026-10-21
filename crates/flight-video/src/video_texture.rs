// flight-lint: allow-file(contract-vocabulary) D16 general closed-family texture traits, as in flight-texture; the moved video functions take the same TextureVariant/TextureUvTransform views

use std::any::Any;
use std::sync::Arc;

use flight_bitmap::HostImageSource;
use flight_entity::{Ref, throw_error};
use flight_geometry::{Matrix3, inverse_matrix3};
use flight_image::{
    IMAGE_TEXTURE_SOURCE_KIND, ImageResource, create_image_resolver_state, create_image_resource,
};
use flight_texture::{
    AlphaType, CreateTexture2DOptions, CreateTextureCommonOptions, Texture, Texture2D,
    TextureDimension, TextureGamut, TextureSourceRef, TextureUvTransform, TextureVariant,
    clone_texture, copy_texture, create_texture_2d, get_texture_uv_matrix,
};

use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use flight_bitmap::HostImageSource;
    use flight_texture::TextureUvTransform;

    use crate::contract::*;

    fn test_host() -> HostVideoCapability {
        return HostVideoCapability {
            provider: Arc::new(()),
            add_ended_listener: None,
            attach_stream: None,
            can_play_type: Arc::new(|_mime| true),
            create_object_url: None,
            create_video_element: None,
            get_current_time: None,
            get_duration: None,
            get_height: Some(Arc::new(|_source| 240.0)),
            get_loop: None,
            get_muted: None,
            get_playback_rate: None,
            get_volume: None,
            get_width: Some(Arc::new(|_source| 320.0)),
            is_ready: Some(Arc::new(|_source| true)),
            load_url: None,
            pause: None,
            play: None,
            release_element: None,
            remove_ended_listener: None,
            revoke_object_url: None,
            set_current_time: None,
            set_loop: None,
            set_muted: None,
            set_playback_rate: None,
            set_volume: None,
        };
    }

    fn test_resource() -> VideoResource {
        let element = Arc::new(HostImageSource {
            provider: Arc::new(()),
            handle: Arc::new(()),
        });
        return create_video_resource(Some(element), None, None);
    }

    #[test]
    fn hostvideocapability_advance_video_texture_matches_advance_video_texture() {
        let s = test_host();
        let mut a = create_video_texture(&s, &test_resource(), None);
        let mut b = create_video_texture(&s, &test_resource(), None);
        assert_eq!(
            s.advance_video_texture(&mut a),
            advance_video_texture(&s, &mut b)
        );
        assert_eq!(a.texture_fields().version, b.texture_fields().version);
    }

    #[test]
    fn hostvideocapability_create_video_texture_matches_create_video_texture() {
        let s = test_host();
        let resource = test_resource();
        let a = s.create_video_texture(&resource, None);
        let b = create_video_texture(&s, &resource, None);
        assert_eq!(a.texture_fields(), b.texture_fields());
        assert_eq!(
            get_video_texture_width(&s, &a),
            get_video_texture_width(&s, &b)
        );
    }

    #[test]
    fn hostvideocapability_get_video_texture_height_matches_get_video_texture_height() {
        let s = test_host();
        let texture = create_video_texture(&s, &test_resource(), None);
        assert_eq!(
            s.get_video_texture_height(&texture),
            get_video_texture_height(&s, &texture)
        );
    }

    #[test]
    fn hostvideocapability_get_video_texture_width_matches_get_video_texture_width() {
        let s = test_host();
        let texture = create_video_texture(&s, &test_resource(), None);
        assert_eq!(
            s.get_video_texture_width(&texture),
            get_video_texture_width(&s, &texture)
        );
    }

    #[test]
    fn hostvideocapability_is_video_texture_frame_ready_matches_is_video_texture_frame_ready() {
        let s = test_host();
        let texture = create_video_texture(&s, &test_resource(), None);
        assert_eq!(
            s.is_video_texture_frame_ready(&texture),
            is_video_texture_frame_ready(&s, &texture)
        );
    }

    #[test]
    fn hostvideocapability_set_video_texture_source_matches_set_video_texture_source() {
        let s = test_host();
        let resource = test_resource();
        let mut a = create_video_texture(&s, &test_resource(), None);
        let mut b = create_video_texture(&s, &test_resource(), None);
        s.set_video_texture_source(&mut a, &resource);
        set_video_texture_source(&s, &mut b, &resource);
        assert_eq!(a.texture_fields(), b.texture_fields());
        assert_eq!(
            get_video_texture_height(&s, &a),
            get_video_texture_height(&s, &b)
        );
    }
}

// The u32 predecessor of the first public frame revision.
const INITIAL_VIDEO_VERSION: u32 = 0xffffffff;

fn create_video_image_resource(
    host_video: &HostVideoCapability,
    source: &VideoResource,
) -> Option<Ref<ImageResource>> {
    let element = source.element.clone()?;
    let image = create_image_resource(element.clone(), &create_image_resolver_state());
    {
        let mut resource = image.write().unwrap();
        initialize_video_image_resource(&mut resource, element, INITIAL_VIDEO_VERSION);
        update_video_image_size(host_video, &mut resource);
    }
    return Some(image);
}

/// Wraps a VideoResource's borrowed host element in an ImageResource source and returns the universal
/// 2D texture. The all-ones initial revision makes the first `advance_video_texture` return 0.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn create_video_texture(
    host_video: &HostVideoCapability,
    source: &VideoResource,
    opts: Option<&CreateTextureCommonOptions>,
) -> Texture2D {
    let image = create_video_image_resource(host_video, source);
    let version = match &image {
        Some(image) => image.read().unwrap().version,
        None => INITIAL_VIDEO_VERSION,
    };
    let mut common = opts.cloned().unwrap_or_default();
    common.version = Some(version);
    let options = CreateTexture2DOptions {
        common,
        source: image.map(|image| image as TextureSourceRef),
    };
    return create_texture_2d(Some(&options));
}

/// The construction initializer of a video ImageResource: straight alpha, sRGB, no size yet, the image
/// kind, the given element and revision.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn initialize_video_image_resource(
    out: &mut ImageResource,
    source: Arc<HostImageSource>,
    version: u32,
) {
    out.alpha_type = AlphaType::Straight;
    out.gamut = TextureGamut::Srgb;
    out.height = 0;
    out.kind = IMAGE_TEXTURE_SOURCE_KIND.to_string();
    out.source = source;
    out.version = version;
    out.width = 0;
}

/// Marks a fresh decoded frame: re-reads the host frame size into the video ImageResource, advances
/// its upload revision (wrapping) and mirrors it as the texture's version. A texture with no video
/// image returns its version unchanged.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn advance_video_texture(
    host_video: &HostVideoCapability,
    texture: &mut dyn TextureVariant,
) -> u32 {
    let Some(image) = get_video_image(texture) else {
        return texture.texture_fields().version;
    };
    let version = {
        let mut guard = image.write().unwrap();
        let resource = as_image_resource_mut(&mut *guard);
        update_video_image_size(host_video, resource);
        resource.version = resource.version.wrapping_add(1);
        resource.version
    };
    texture.texture_fields_mut().version = version;
    return version;
}

// The source's `texture.source as ImageResource` through the canonical safe downcast.
fn as_image_resource(source: &dyn flight_texture::TextureSource) -> Option<&ImageResource> {
    let any: &dyn Any = source;
    return any.downcast_ref::<ImageResource>();
}

fn as_image_resource_mut(source: &mut dyn flight_texture::TextureSource) -> &mut ImageResource {
    let any: &mut dyn Any = source;
    return any
        .downcast_mut::<ImageResource>()
        .expect("a video image source");
}

/// Clones sampling and UV state while sharing the borrowed video ImageResource.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn clone_video_texture(source: &dyn TextureVariant) -> Texture {
    return clone_texture(source);
}

/// Copies a video-backed texture through the universal texture field copier.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn copy_video_texture(out: &mut dyn TextureVariant, source: &dyn TextureVariant) {
    copy_texture(out, source);
}

/// Detaches the borrowed video ImageResource without touching the VideoResource; later readers return
/// their sentinels.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn destroy_video_texture(texture: &mut Texture2D) {
    texture.source = None;
    texture.texture_fields_mut().version = INITIAL_VIDEO_VERSION;
}

// The 2D texture's source when it is an ImageResource (the only source a video texture holds).
fn get_video_image(texture: &dyn TextureVariant) -> Option<TextureSourceRef> {
    if texture.dimension() != TextureDimension::Texture2D {
        return None;
    }
    let source = texture.source_2d()?.clone()?;
    let is_image = as_image_resource(&*source.read().unwrap()).is_some();
    return if is_image { Some(source) } else { None };
}

fn get_video_source(texture: &dyn TextureVariant) -> Option<Arc<HostImageSource>> {
    let image = get_video_image(texture)?;
    let guard = image.read().unwrap();
    return as_image_resource(&*guard).map(|resource| resource.source.clone());
}

/// The host's decoded frame height, or -1 while the element is absent or reports no height.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn get_video_texture_height(
    host_video: &HostVideoCapability,
    texture: &dyn TextureVariant,
) -> f32 {
    let height = match (get_video_source(texture), &host_video.get_height) {
        (Some(source), Some(get_height)) => get_height(&source),
        _ => 0.0,
    };
    return if height > 0.0 { height } else { -1.0 };
}

/// The inverse of the texture's UV transform.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn get_video_texture_inverse_uv_matrix(out: &mut Matrix3, texture: &dyn TextureUvTransform) {
    get_video_texture_uv_matrix(out, texture);
    let forward = out.clone();
    inverse_matrix3(out, &forward);
}

/// The texture's UV transform (the universal texture UV matrix).
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn get_video_texture_uv_matrix(out: &mut Matrix3, texture: &dyn TextureUvTransform) {
    get_texture_uv_matrix(out, texture);
}

/// The host's decoded frame width, or -1 while the element is absent or reports no width.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn get_video_texture_width(
    host_video: &HostVideoCapability,
    texture: &dyn TextureVariant,
) -> f32 {
    let width = match (get_video_source(texture), &host_video.get_width) {
        (Some(source), Some(get_width)) => get_width(&source),
        _ => 0.0,
    };
    return if width > 0.0 { width } else { -1.0 };
}

/// True once the element reports a decoded current frame and non-zero dimensions.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn is_video_texture_frame_ready(
    host_video: &HostVideoCapability,
    texture: &dyn TextureVariant,
) -> bool {
    let Some(source) = get_video_source(texture) else {
        return false;
    };
    let ready = host_video
        .is_ready
        .as_ref()
        .is_some_and(|is_ready| is_ready(&source));
    return ready
        && host_video
            .get_width
            .as_ref()
            .map_or(0.0, |get_width| get_width(&source))
            > 0.0
        && host_video
            .get_height
            .as_ref()
            .map_or(0.0, |get_height| get_height(&source))
            > 0.0;
}

/// Resets the shared revision so the next advance wraps to 0 and every state re-uploads.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn reset_video_texture_frame(texture: &mut dyn TextureVariant) {
    if let Some(image) = get_video_image(texture) {
        image.write().unwrap().texture_source_fields_mut().version = INITIAL_VIDEO_VERSION;
    }
    texture.texture_fields_mut().version = INITIAL_VIDEO_VERSION;
}

/// Replaces the texture's video ImageResource with one over `source`'s current element and resets
/// the revision. Panics (the source's throw) for a texture that is not 2D.
// flight-lint: allow(conform-extra) D8 approved ownership move from texture to video; the pinned TS archive keeps videoTexture.ts in texture
pub fn set_video_texture_source(
    host_video: &HostVideoCapability,
    texture: &mut dyn TextureVariant,
    source: &VideoResource,
) {
    if texture.dimension() != TextureDimension::Texture2D {
        throw_error("setVideoTextureSource requires a Texture2D");
    }
    let image = create_video_image_resource(host_video, source);
    *texture.source_2d_mut().expect("2d source") = image.map(|image| image as TextureSourceRef);
    texture.texture_fields_mut().version = INITIAL_VIDEO_VERSION;
}

// The host's frame size into the image (0 when the host cannot report it). Host sizes are JS numbers;
// the canonical texture source stores whole pixels.
fn update_video_image_size(host_video: &HostVideoCapability, image: &mut ImageResource) {
    image.width = host_video
        .get_width
        .as_ref()
        .map_or(0.0, |get_width| get_width(&image.source)) as u32;
    image.height = host_video
        .get_height
        .as_ref()
        .map_or(0.0, |get_height| get_height(&image.source)) as u32;
}

impl HostVideoCapability {
    pub fn create_video_texture(
        &self,
        source: &VideoResource,
        opts: Option<&CreateTextureCommonOptions>,
    ) -> Texture2D {
        return create_video_texture(self, source, opts);
    }

    pub fn advance_video_texture(&self, texture: &mut dyn TextureVariant) -> u32 {
        return advance_video_texture(self, texture);
    }

    pub fn get_video_texture_height(&self, texture: &dyn TextureVariant) -> f32 {
        return get_video_texture_height(self, texture);
    }

    pub fn get_video_texture_width(&self, texture: &dyn TextureVariant) -> f32 {
        return get_video_texture_width(self, texture);
    }

    pub fn is_video_texture_frame_ready(&self, texture: &dyn TextureVariant) -> bool {
        return is_video_texture_frame_ready(self, texture);
    }

    pub fn set_video_texture_source(
        &self,
        texture: &mut dyn TextureVariant,
        source: &VideoResource,
    ) {
        set_video_texture_source(self, texture, source);
    }
}
